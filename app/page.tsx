import Link from 'next/link';
import { Landscape } from './landscape';
import { TripPreview } from './trip-preview';
import './landing.css';

const features = [
  ['◫', 'Shared expenses', 'Record who paid, where you spent, and which friends shared the bill.'],
  ['≡', 'Explain my balance', 'See the exact shares and repayments behind each member’s outstanding balance.'],
  ['⇄', 'Fewer transfers', 'Find the smallest set of repayments for trips with up to eight unsettled balances.'],
  ['÷', 'Split with a subset', 'Split a bill among the whole group or only the friends who took part.'],
  ['!', 'Expense warnings', 'Review possible duplicates and unusually large bills before you save.'],
  ['◎', 'Trip insights', 'See which category cost the most and who picked up the most bills.'],
] as const;

const steps = [
  ['Create a trip', 'Give the trip a name and add the friends traveling with you.'],
  ['Split as you go', 'Record each bill, choose a payer, and select who shares the cost.'],
  ['Settle up', 'Review the suggested transfers and record repayments once they’re made.'],
] as const;

function Arrow({ down = false }: { down?: boolean }) {
  return (
    <span className="landing-arrow" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={down ? 'M12 4v16m-6-6 6 6 6-6' : 'M6 18 18 6M7 6h11v11'} />
      </svg>
    </span>
  );
}

export default function Home() {
  return (
    <div className="landing" id="home">
      <main>
        <section className="hero">
          <Landscape />
          <nav className="hero-nav" aria-label="Main navigation">
            <a className="brand landing-brand" href="#home">
              <span className="landing-logo" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 8h18l-5-5m5 5-5 5M21 16H3l5-5m-5 5 5 5" />
                </svg>
              </span>
              splittrack.
            </a>
            <div className="hero-links">
              <a href="#home">Home</a>
              <a href="#features">Features</a>
              <a href="#preview">Live preview</a>
              <a href="#how">How it works</a>
              <Link href="/auth">Sign in</Link>
            </div>
            <Link className="hero-button primary compact" href="/dashboard">Open dashboard <Arrow /></Link>
          </nav>

          <div className="hero-content">
            <h1>Split<span>track.</span></h1>
            <p className="hero-tagline">Go together. Spend smarter.</p>
            <p className="hero-description">Track shared trip expenses, understand who owes what, and settle up with friends.</p>
            <div className="hero-actions">
              <Link className="hero-button primary" href="/dashboard#new-trip">Start your trip <Arrow /></Link>
              <a className="hero-button glass" href="#preview">Explore live demo <Arrow down /></a>
            </div>
          </div>

          <div className="hero-bottom">
            <a href="#features"><strong>Share every expense</strong><small>Split with all or part of the group</small></a>
            <a href="#preview"><strong>Understand every balance</strong><small>See each share and repayment</small></a>
            <a href="#how"><strong>Settle with fewer payments</strong><small>Get suggested transfers</small></a>
          </div>
        </section>

        <section className="landing-section" id="features">
          <h2>Less admin.<br />More adventure.</h2>
          <div className="landing-grid feature-grid">
            {features.map(([icon, title, description]) => (
              <article className="feature-card" key={title}>
                <span className="feature-symbol" aria-hidden="true">{icon}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-preview" id="preview">
          <TripPreview dashboardLink={
            <Link className="hero-button primary" href="/dashboard">Open your dashboard <Arrow /></Link>
          } />
        </section>

        <section className="landing-dark" id="how">
          <div className="landing-section">
            <h2>From first plan<br />to final payment.</h2>
            <ol className="landing-grid landing-steps">
              {steps.map(([title, description]) => (
                <li key={title}><h3>{title}</h3><p>{description}</p></li>
              ))}
            </ol>
            <Link className="hero-button primary" href="/dashboard#new-trip">Get started <Arrow /></Link>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <a className="brand" href="#home">splittrack.</a>
        <a href="#home">Back to top</a>
      </footer>
    </div>
  );
}

