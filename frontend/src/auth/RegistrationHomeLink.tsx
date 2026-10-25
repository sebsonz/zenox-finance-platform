import "./RegistrationHomeLink.css";

type RegistrationHomeLinkProps = {
  /** Hide the public-home link while an authenticated user configures an organisation. */
  visible?: boolean;
};

/**
 * Accessible navigation back to the public ZENOX Finance landing page.
 * Kept independent so it can be reused by login, signup and password-recovery views.
 */
export function RegistrationHomeLink({
  visible = true,
}: RegistrationHomeLinkProps) {
  if (!visible) return null;

  return (
    <a
      className="registration-home-link"
      href="/"
      aria-label="Retour à l’accueil ZENOX Finance"
    >
      <span className="registration-home-link__arrow" aria-hidden="true">
        ←
      </span>
      <span>Retour à l’accueil</span>
    </a>
  );
}
