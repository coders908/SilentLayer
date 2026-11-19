
interface HeroStep {
  label: string;
  detail: string;
}

interface PageHeroProps {
  eyebrow: string;
  headline: string;
  lead: string;
  steps?: HeroStep[];
}

function PageHero({ eyebrow, headline, lead, steps }: PageHeroProps) {
  return (
    <header className="hero">
      <p className="hero__eyebrow">{eyebrow}</p>
      <h1 className="hero__headline">{headline}</h1>
      <p className="hero__lead">{lead}</p>

      {steps && steps.length > 0 ? (
        <ol className="hero__steps">
          {steps.map((step, index) => (
            <li className="hero-step" key={step.label}>
              <span className="hero-step__index mono" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="hero-step__body">
                <span className="hero-step__label">{step.label}</span>
                <span className="hero-step__detail">{step.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </header>
  );
}

export default PageHero;
