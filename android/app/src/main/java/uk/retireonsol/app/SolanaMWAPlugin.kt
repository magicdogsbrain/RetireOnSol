package uk.retireonsol.app

import android.content.ActivityNotFoundException
import android.content.Intent
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.solana.mobilewalletadapter.clientlib.protocol.JsonRpc20Client
import com.solana.mobilewalletadapter.clientlib.protocol.MobileWalletAdapterClient
import com.solana.mobilewalletadapter.clientlib.scenario.LocalAssociationIntentCreator
import com.solana.mobilewalletadapter.clientlib.scenario.LocalAssociationScenario
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import org.json.JSONArray
import org.json.JSONObject

/**
 * Capacitor plugin that bridges to the native Solana MWA SDK.
 *
 * Exposes 4 methods to JavaScript:
 *   authorize()                    → connect, returns publicKey + authToken
 *   signMessage(message, authToken) → sign arbitrary bytes
 *   signAndSendTransaction(transaction, authToken) → sign + broadcast
 *   disconnect(authToken)          → deauthorize
 *
 * Each method opens its own MWA session (LocalAssociationScenario),
 * performs the operation, then closes the session. This matches the
 * React Native reference implementation's per-transact model.
 */
@CapacitorPlugin(name = "SolanaMWA")
class SolanaMWAPlugin : Plugin(), CoroutineScope {

    override val coroutineContext =
        Dispatchers.IO + CoroutineName("SolanaMWAPluginScope") + SupervisorJob()

    companion object {
        private const val TAG = "SolanaMWA"
        private const val ASSOCIATION_TIMEOUT_MS = 10_000L
        private const val CLIENT_TIMEOUT_MS = 90_000L
    }

    private val mutex = Mutex()

    private fun appIdentity(): JSONObject = JSONObject().apply {
        put("name", "RetireOnSol")
        put("uri", "https://retireonsol.uk")
        put("icon", "icons/icon-192.png")
    }

    // ── authorize ──────────────────────────────────────────────────────────
    @PluginMethod
    fun authorize(call: PluginCall) {
        bridge.saveCall(call)
        launch {
            mutex.lock()
            try {
                val (client, scenario) = openSession(call) ?: return@launch
                try {
                    val params = JSONObject().apply {
                        put("identity", appIdentity())
                        put("cluster", "mainnet-beta")
                    }
                    val result = client
                        .methodCall("authorize", params, CLIENT_TIMEOUT_MS.toInt())
                        .get() as JSONObject

                    val ret = JSObject()
                    // MWA returns accounts array with address + label
                    if (result.has("accounts")) {
                        val accounts = result.getJSONArray("accounts")
                        if (accounts.length() > 0) {
                            val first = accounts.getJSONObject(0)
                            ret.put("publicKey", first.getString("address"))
                            if (first.has("label") && !first.isNull("label")) {
                                ret.put("accountLabel", first.getString("label"))
                            }
                        }
                    }
                    // Fallback for legacy protocol
                    if (!ret.has("publicKey") && result.has("public_key")) {
                        ret.put("publicKey", result.getString("public_key"))
                    }
                    if (result.has("auth_token")) {
                        ret.put("authToken", result.getString("auth_token"))
                    }
                    if (result.has("wallet_uri_base")) {
                        ret.put("walletUriBase", result.getString("wallet_uri_base"))
                    }

                    Log.d(TAG, "authorize success: publicKey=${ret.getString("publicKey")}")
                    call.resolve(ret)
                } finally {
                    closeSession(scenario)
                }
            } catch (e: Exception) {
                handleError(call, "authorize", e)
            } finally {
                cleanup(call)
            }
        }
    }

    // ── signMessage ────────────────────────────────────────────────────────
    @PluginMethod
    fun signMessage(call: PluginCall) {
        val messageBase64 = call.getString("message")
        if (messageBase64 == null) {
            call.reject("message (base64) is required", "INVALID_PARAMS")
            return
        }
        val authToken = call.getString("authToken")
        if (authToken == null) {
            call.reject("authToken is required", "INVALID_PARAMS")
            return
        }

        bridge.saveCall(call)
        launch {
            mutex.lock()
            try {
                val (client, scenario) = openSession(call) ?: return@launch
                try {
                    // Reauthorize with cached token
                    val reauth = client.methodCall(
                        "reauthorize",
                        JSONObject().apply {
                            put("identity", appIdentity())
                            put("auth_token", authToken)
                        },
                        CLIENT_TIMEOUT_MS.toInt()
                    ).get() as JSONObject

                    // Get the address from reauth for the addresses param
                    var address: String? = null
                    if (reauth.has("accounts")) {
                        val accounts = reauth.getJSONArray("accounts")
                        if (accounts.length() > 0) {
                            address = accounts.getJSONObject(0).getString("address")
                        }
                    }
                    if (address == null && reauth.has("public_key")) {
                        address = reauth.getString("public_key")
                    }

                    // Sign the message
                    val signParams = JSONObject().apply {
                        put("payloads", JSONArray().put(messageBase64))
                        if (address != null) {
                            put("addresses", JSONArray().put(address))
                        }
                    }
                    val result = client
                        .methodCall("sign_messages", signParams, CLIENT_TIMEOUT_MS.toInt())
                        .get() as JSONObject

                    val signatures = result.getJSONArray("signed_payloads")
                    val ret = JSObject()
                    ret.put("signature", signatures.getString(0))
                    Log.d(TAG, "signMessage success")
                    call.resolve(ret)
                } finally {
                    closeSession(scenario)
                }
            } catch (e: Exception) {
                handleError(call, "signMessage", e)
            } finally {
                cleanup(call)
            }
        }
    }

    // ── signAndSendTransaction ─────────────────────────────────────────────
    @PluginMethod
    fun signAndSendTransaction(call: PluginCall) {
        val txBase64 = call.getString("transaction")
        if (txBase64 == null) {
            call.reject("transaction (base64) is required", "INVALID_PARAMS")
            return
        }
        val authToken = call.getString("authToken")
        if (authToken == null) {
            call.reject("authToken is required", "INVALID_PARAMS")
            return
        }

        bridge.saveCall(call)
        launch {
            mutex.lock()
            try {
                val (client, scenario) = openSession(call) ?: return@launch
                try {
                    // Reauthorize
                    client.methodCall(
                        "reauthorize",
                        JSONObject().apply {
                            put("identity", appIdentity())
                            put("auth_token", authToken)
                        },
                        CLIENT_TIMEOUT_MS.toInt()
                    ).get()

                    // Sign and send
                    val sendParams = JSONObject().apply {
                        put("payloads", JSONArray().put(txBase64))
                    }
                    val result = client
                        .methodCall("sign_and_send_transactions", sendParams, CLIENT_TIMEOUT_MS.toInt())
                        .get() as JSONObject

                    val signatures = result.getJSONArray("signatures")
                    val ret = JSObject()
                    ret.put("signature", signatures.getString(0))
                    Log.d(TAG, "signAndSendTransaction success: sig=${ret.getString("signature")}")
                    call.resolve(ret)
                } finally {
                    closeSession(scenario)
                }
            } catch (e: Exception) {
                handleError(call, "signAndSendTransaction", e)
            } finally {
                cleanup(call)
            }
        }
    }

    // ── disconnect ─────────────────────────────────────────────────────────
    @PluginMethod
    fun disconnect(call: PluginCall) {
        val authToken = call.getString("authToken")
        if (authToken == null) {
            // Nothing to deauthorize
            call.resolve()
            return
        }

        bridge.saveCall(call)
        launch {
            mutex.lock()
            try {
                val (client, scenario) = openSession(call) ?: return@launch
                try {
                    client.methodCall(
                        "deauthorize",
                        JSONObject().apply {
                            put("auth_token", authToken)
                        },
                        CLIENT_TIMEOUT_MS.toInt()
                    ).get()
                    Log.d(TAG, "disconnect/deauthorize success")
                    call.resolve()
                } finally {
                    closeSession(scenario)
                }
            } catch (e: Exception) {
                // Deauthorize failures are non-critical
                Log.w(TAG, "Deauthorize failed (non-critical)", e)
                call.resolve()
            } finally {
                cleanup(call)
            }
        }
    }

    // ── Session helpers ────────────────────────────────────────────────────

    private suspend fun openSession(call: PluginCall): Pair<MobileWalletAdapterClient, LocalAssociationScenario>? {
        val scenario = LocalAssociationScenario(CLIENT_TIMEOUT_MS.toInt())
        val intent = LocalAssociationIntentCreator.createAssociationIntent(
            null,  // no URI prefix — system chooser picks the wallet
            scenario.port,
            scenario.session
        )
        try {
            withContext(Dispatchers.Main) {
                val chooser = Intent.createChooser(intent, "Choose a wallet")
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                getActivity()?.startActivity(chooser)
                    ?: throw NullPointerException("No activity available to launch wallet")
            }
        } catch (e: ActivityNotFoundException) {
            call.reject("No MWA-compatible wallet found on this device", "WALLET_NOT_FOUND", e)
            return null
        }

        return try {
            val client = scenario.start()
                .get(ASSOCIATION_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            Pair(client, scenario)
        } catch (e: TimeoutException) {
            scenario.close()
            call.reject("Timed out connecting to wallet", "TIMEOUT", e)
            null
        } catch (e: ExecutionException) {
            scenario.close()
            call.reject("Failed to connect to wallet: ${e.cause?.message ?: e.message}", "CONNECTION_FAILED", e)
            null
        }
    }

    private fun closeSession(scenario: LocalAssociationScenario) {
        try {
            scenario.close().get(ASSOCIATION_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        } catch (e: Exception) {
            Log.w(TAG, "Session close failed (non-critical)", e)
        }
    }

    private fun cleanup(call: PluginCall) {
        try { bridge.releaseCall(call) } catch (_: Exception) {}
        if (mutex.isLocked) {
            mutex.unlock()
        }
    }

    private fun handleError(call: PluginCall, method: String, e: Exception) {
        Log.e(TAG, "$method failed", e)
        when (e) {
            is ActivityNotFoundException ->
                call.reject("No MWA wallet installed", "WALLET_NOT_FOUND", e)
            is TimeoutException ->
                call.reject("Wallet operation timed out", "TIMEOUT", e)
            is ExecutionException -> {
                val cause = e.cause
                if (cause is JsonRpc20Client.JsonRpc20RemoteException) {
                    call.reject(
                        "Wallet error: ${cause.message} (code ${cause.code})",
                        "JSON_RPC_ERROR",
                        e
                    )
                } else {
                    call.reject(
                        "Wallet operation failed: ${cause?.message ?: e.message}",
                        "EXECUTION_ERROR",
                        e
                    )
                }
            }
            else ->
                call.reject("Wallet operation failed: ${e.message}", "UNKNOWN_ERROR", e)
        }
    }
}
