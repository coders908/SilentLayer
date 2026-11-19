interface PageHeroProps {
  eyebrow: string;
  headline: string;
  lead: string;
}

function PageHero({ eyebrow, headline, lead }: PageHeroProps) {
  return (
    <header className="hero">
      <p className="hero__eyebrow">{eyebrow}</p>
      <h1 className="hero__headline">{headline}</h1>
      <p className="hero__lead">{lead}</p>
    </header>
  );
}

export default PageHero;
