export default function PrivacyPolicy() {
  return (
    <div className="max-w-content mx-auto px-lg py-xl">
      <h1 className="text-3xl font-display font-semibold text-text-primary mb-6">Privacy Policy</h1>
      <p className="text-text-muted font-body text-sm mb-8">Effective date: September 2026</p>

      <div className="space-y-8 font-body text-text-secondary leading-relaxed">
        <section>
          <h2 className="text-xl font-display font-semibold text-text-primary mb-3">What We Collect</h2>
          <p>
            When you create an account, we collect your <strong>email address</strong> and a securely hashed password.
            These are used solely to authenticate you and associate your in-game save data. If you play as a guest, we
            do not collect an email address.
          </p>
          <p>
            If you play as a guest, your browser stores a random, client-generated anonymous identifier that we use
            solely to key your guest game-save data. We do not treat this identifier as personal data.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold text-text-primary mb-3">How We Use It</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Store and restore your game-save progress across sessions.</li>
            <li>Enforce rate limits to prevent abuse and fraud.</li>
            <li>Operate and secure the service (Cloudflare edge logs).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold text-text-primary mb-3">Analytics &amp; Tracking</h2>
          <p>
            We do not use any third-party analytics, advertising, or tracking services. The only operational telemetry
            comes from Cloudflare edge logs, which record IP addresses, user-agent strings, and request timing for
            infrastructure reliability and security purposes. This data is not used for profiling.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold text-text-primary mb-3">Data Storage &amp; Retention</h2>
          <p>
            Game-save state is stored in a Cloudflare D1 database keyed to your account identifier. D1 backups are
            retained for up to 30 days via Cloudflare D1 Time Travel. Guest-session data is purged after 24 hours of
            inactivity. Account passwords are stored as salted PBKDF2 hashes, never plaintext.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold text-text-primary mb-3">Data Sharing</h2>
          <p>We do not sell, trade, or share your identifiers with any third party.</p>
        </section>

        <section>
          <h2 className="text-xl font-display font-semibold text-text-primary mb-3">Contact</h2>
          <p>
            For questions about this policy, contact <span className="text-accent">privacy@arcanefamiliars.game</span>{' '}
            (placeholder).
          </p>
        </section>
      </div>
    </div>
  );
}
