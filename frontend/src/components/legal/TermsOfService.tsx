export default function TermsOfService() {
  return (
    <div className="max-w-content mx-auto px-lg py-xl">
      <h1 className="text-3xl font-display font-semibold text-text-primary mb-6">Terms of Service</h1>
      <p className="text-text-muted font-body text-sm mb-8">Effective date: September 2026</p>

      <div className="space-y-8 font-body text-text-secondary leading-relaxed">
        <section>
          <h2 className="text-xl font-display font-semibold text-text-primary mb-3">Acceptance</h2>
          <p>
            By accessing or playing Arcane Familiars you agree to these terms. If you do not agree, do not use the
            service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold text-text-primary mb-3">Description of Service</h2>
          <p>
            Arcane Familiars is a free-to-play web game in early access. You may play as a guest or connect an Ethereum
            wallet via Immutable Passport to persist your save data. The service is not yet monetized and no purchases
            are available at this time.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold text-text-primary mb-3">Accounts &amp; Guest Play</h2>
          <p>
            Guest sessions are temporary; save data is purged after 24 hours of inactivity. Wallet-connected accounts
            persist save data keyed to your IMX Passport ID. You are responsible for securing your own wallet and
            credentials.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold text-text-primary mb-3">Rules of Conduct</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>No cheating, exploiting bugs, or using automated tools.</li>
            <li>No harassment, hate speech, or abusive behavior.</li>
            <li>No attempts to access other users' data or accounts.</li>
            <li>Follow all applicable laws in your jurisdiction.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold text-text-primary mb-3">Game-Save Data</h2>
          <p>
            Save data is provided as-is during this early-access phase and is not guaranteed to be preserved. We may
            reset or migrate data as needed during development.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold text-text-primary mb-3">Intellectual Property</h2>
          <p>
            All game content, artwork, and code are owned by Arcane Familiars or its licensors. You receive a limited,
            non-exclusive license to use the service for personal entertainment.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold text-text-primary mb-3">Disclaimer &amp; Liability</h2>
          <p>
            The service is provided "as is" without warranties of any kind. To the fullest extent permitted by law,
            Arcane Familiars shall not be liable for any damages arising from use of the service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold text-text-primary mb-3">Governing Law</h2>
          <p>These terms are governed by the laws of the applicable jurisdiction (placeholder — to be finalized).</p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold text-text-primary mb-3">Contact</h2>
          <p>
            For questions about these terms, contact <span className="text-accent">legal@arcanefamiliars.game</span>{' '}
            (placeholder).
          </p>
        </section>
      </div>
    </div>
  );
}
