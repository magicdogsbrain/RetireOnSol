import './LegalPages.css';

export function PrivacyPolicy() {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <a href="/" className="back-link">&larr; Back to App</a>
        <img src="icons/icon.svg" alt="RetireOnSol" className="legal-logo" />
        <h1>Privacy Policy</h1>
        <p className="last-updated">Last updated: January 27, 2025</p>
      </header>

      <main className="legal-content">
        <section>
          <h2>Introduction</h2>
          <p>
            Welcome to RetireOnSol ("we," "our," or "us"). We are committed to protecting your privacy
            and being transparent about our data practices. This Privacy Policy explains how we handle
            information when you use our retirement planning calculator application.
          </p>
        </section>

        <section>
          <h2>Information We Collect</h2>
          <h3>Information You Provide</h3>
          <p>
            RetireOnSol is designed with privacy in mind. We collect minimal information:
          </p>
          <ul>
            <li>
              <strong>Calculator Inputs:</strong> Values you enter into the calculator (SOL holdings,
              DCA amounts, retirement timeline, etc.) are stored locally on your device using browser
              localStorage. This data never leaves your device and is not transmitted to our servers.
            </li>
            <li>
              <strong>Wallet Connection:</strong> If you choose to connect a Solana wallet, we only
              read your public wallet address and SOL balance. We do not have access to your private
              keys, cannot initiate transactions, and do not store your wallet information on any server.
            </li>
          </ul>

          <h3>Information Collected Automatically</h3>
          <p>
            We may collect basic analytics data to improve the application:
          </p>
          <ul>
            <li>Device type and browser information</li>
            <li>General usage patterns (pages visited, features used)</li>
            <li>Crash reports and error logs</li>
          </ul>
          <p>
            This data is anonymized and cannot be used to identify you personally.
          </p>
        </section>

        <section>
          <h2>How We Use Information</h2>
          <p>The limited information we collect is used to:</p>
          <ul>
            <li>Provide and maintain the application functionality</li>
            <li>Improve user experience and fix bugs</li>
            <li>Analyze usage patterns to enhance features</li>
          </ul>
        </section>

        <section>
          <h2>Data Storage and Security</h2>
          <p>
            <strong>Local Storage:</strong> All your calculator settings and preferences are stored
            locally in your browser's localStorage. This means:
          </p>
          <ul>
            <li>Your data stays on your device</li>
            <li>Clearing your browser data will remove your saved settings</li>
            <li>We cannot access or recover this data</li>
          </ul>
          <p>
            <strong>No Account Required:</strong> RetireOnSol does not require you to create an account
            or provide any personal information to use the application.
          </p>
        </section>

        <section>
          <h2>Third-Party Services</h2>
          <p>Our application may interact with the following third-party services:</p>
          <ul>
            <li>
              <strong>Solana Blockchain:</strong> When you connect a wallet, we interact with the
              Solana blockchain to read your public balance. This is read-only access.
            </li>
            <li>
              <strong>Price Data APIs:</strong> We fetch current SOL prices from public cryptocurrency
              price APIs. No personal data is sent with these requests.
            </li>
          </ul>
        </section>

        <section>
          <h2>Data Sharing</h2>
          <p>
            We do not sell, trade, or rent your personal information to third parties. We may share
            anonymized, aggregated data for analytical purposes, but this data cannot be used to
            identify any individual user.
          </p>
        </section>

        <section>
          <h2>Your Rights and Choices</h2>
          <p>You have control over your data:</p>
          <ul>
            <li>
              <strong>Clear Data:</strong> Use the "Reset Settings" button in the app or clear your
              browser's localStorage to remove all saved data.
            </li>
            <li>
              <strong>Wallet Disconnection:</strong> You can disconnect your wallet at any time.
              We do not retain any wallet information after disconnection.
            </li>
            <li>
              <strong>Opt-Out:</strong> You can use the application without connecting a wallet or
              enabling any optional features.
            </li>
          </ul>
        </section>

        <section>
          <h2>Children's Privacy</h2>
          <p>
            RetireOnSol is not intended for use by children under 18. We do not knowingly collect
            information from children. If you believe a child has provided us with information,
            please contact us so we can take appropriate action.
          </p>
        </section>

        <section>
          <h2>Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify users of any material
            changes by updating the "Last updated" date at the top of this policy. We encourage you
            to review this policy periodically.
          </p>
        </section>

        <section>
          <h2>Contact Us</h2>
          <p>
            If you have questions or concerns about this Privacy Policy or our data practices,
            please reach out through our GitHub repository at{' '}
            <a href="https://github.com/magicdogsbrain/RetireOnSol" target="_blank" rel="noopener noreferrer">
              github.com/magicdogsbrain/RetireOnSol
            </a>.
          </p>
        </section>
      </main>

      <footer className="legal-footer">
        <p>&copy; {new Date().getFullYear()} RetireOnSol. All rights reserved.</p>
      </footer>
    </div>
  );
}
