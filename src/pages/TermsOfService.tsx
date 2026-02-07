import './LegalPages.css';

export function TermsOfService() {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <a href="/" className="back-link">&larr; Back to App</a>
        <img src="icons/icon.svg" alt="RetireOnSol" className="legal-logo" />
        <h1>Terms of Service</h1>
        <p className="last-updated">Last updated: January 27, 2025</p>
      </header>

      <main className="legal-content">
        <section>
          <h2>Agreement to Terms</h2>
          <p>
            By accessing or using RetireOnSol ("the Application," "we," "our," or "us"), you agree
            to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms,
            please do not use the Application.
          </p>
        </section>

        <section>
          <h2>Description of Service</h2>
          <p>
            RetireOnSol is a free, open-source retirement planning calculator that helps users
            visualize potential outcomes of dollar-cost averaging (DCA) into Solana (SOL) and
            planning retirement withdrawals. The Application provides:
          </p>
          <ul>
            <li>Portfolio growth projections using various models (CAGR, Power Law, S-Curve)</li>
            <li>Monte Carlo simulations for risk analysis</li>
            <li>Retirement drawdown planning with success rate calculations</li>
            <li>Optional Solana wallet integration for balance reading</li>
          </ul>
        </section>

        <section>
          <h2>Important Disclaimers</h2>

          <h3>Not Financial Advice</h3>
          <p className="warning-text">
            <strong>THE APPLICATION IS FOR EDUCATIONAL AND ENTERTAINMENT PURPOSES ONLY.</strong>
          </p>
          <p>
            RetireOnSol does not provide financial, investment, tax, legal, or other professional
            advice. The projections, calculations, and simulations provided by the Application are
            hypothetical and based on mathematical models with assumptions that may not reflect
            actual market conditions.
          </p>

          <h3>No Guarantees</h3>
          <p>
            Past performance does not guarantee future results. Cryptocurrency markets are highly
            volatile and unpredictable. The projections shown in the Application:
          </p>
          <ul>
            <li>Are not predictions of actual future performance</li>
            <li>Do not account for all possible market conditions</li>
            <li>Should not be relied upon for making investment decisions</li>
            <li>May differ significantly from actual outcomes</li>
          </ul>

          <h3>Investment Risk</h3>
          <p>
            Investing in cryptocurrencies, including Solana (SOL), involves substantial risk of loss.
            You could lose some or all of your investment. Before making any investment decisions,
            you should:
          </p>
          <ul>
            <li>Conduct your own research (DYOR)</li>
            <li>Consult with qualified financial advisors</li>
            <li>Only invest what you can afford to lose</li>
            <li>Understand the risks involved in cryptocurrency investing</li>
          </ul>
        </section>

        <section>
          <h2>User Responsibilities</h2>
          <p>By using the Application, you agree that:</p>
          <ul>
            <li>You are at least 18 years of age</li>
            <li>You are responsible for your own investment decisions</li>
            <li>You will not rely solely on the Application for financial planning</li>
            <li>You understand the limitations and assumptions of the projections</li>
            <li>You will use the Application in compliance with applicable laws</li>
          </ul>
        </section>

        <section>
          <h2>Wallet Connection</h2>
          <p>
            If you choose to connect a Solana wallet to the Application:
          </p>
          <ul>
            <li>You are solely responsible for the security of your wallet and private keys</li>
            <li>We only read your public wallet address and balance; we cannot access your private keys</li>
            <li>We cannot initiate, approve, or execute any blockchain transactions on your behalf</li>
            <li>You should verify wallet connection requests and understand what permissions you are granting</li>
          </ul>
        </section>

        <section>
          <h2>Intellectual Property</h2>
          <p>
            RetireOnSol is open-source software. The source code is available under the terms
            specified in our GitHub repository. You are free to:
          </p>
          <ul>
            <li>Use the Application for personal, non-commercial purposes</li>
            <li>View and fork the source code according to the repository license</li>
            <li>Contribute to the project through proper channels</li>
          </ul>
          <p>
            The RetireOnSol name, logo, and branding remain the property of the project maintainers.
          </p>
        </section>

        <section>
          <h2>Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, RETIREONSOL AND ITS CREATORS, CONTRIBUTORS,
            AND AFFILIATES SHALL NOT BE LIABLE FOR:
          </p>
          <ul>
            <li>Any investment losses or financial damages resulting from use of the Application</li>
            <li>Any decisions made based on information provided by the Application</li>
            <li>Any errors, inaccuracies, or omissions in the projections or calculations</li>
            <li>Any technical issues, bugs, or service interruptions</li>
            <li>Any unauthorized access to your data or wallet</li>
            <li>Any indirect, incidental, special, or consequential damages</li>
          </ul>
          <p>
            THE APPLICATION IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
            EITHER EXPRESS OR IMPLIED.
          </p>
        </section>

        <section>
          <h2>Indemnification</h2>
          <p>
            You agree to indemnify, defend, and hold harmless RetireOnSol and its creators from
            any claims, damages, losses, or expenses arising from your use of the Application or
            violation of these Terms.
          </p>
        </section>

        <section>
          <h2>Modifications to Service and Terms</h2>
          <p>
            We reserve the right to modify, suspend, or discontinue the Application at any time
            without notice. We may also update these Terms from time to time. Continued use of
            the Application after changes constitutes acceptance of the modified Terms.
          </p>
        </section>

        <section>
          <h2>Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with applicable laws,
            without regard to conflict of law principles.
          </p>
        </section>

        <section>
          <h2>Severability</h2>
          <p>
            If any provision of these Terms is found to be unenforceable, the remaining provisions
            will continue in full force and effect.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            For questions about these Terms, please visit our GitHub repository at{' '}
            <a href="https://github.com/magicdogsbrain/RetireOnSol" target="_blank" rel="noopener noreferrer">
              github.com/magicdogsbrain/RetireOnSol
            </a>.
          </p>
        </section>

        <section className="acceptance-notice">
          <p>
            <strong>By using RetireOnSol, you acknowledge that you have read, understood, and
            agree to be bound by these Terms of Service.</strong>
          </p>
        </section>
      </main>

      <footer className="legal-footer">
        <p>&copy; {new Date().getFullYear()} RetireOnSol. All rights reserved.</p>
      </footer>
    </div>
  );
}
