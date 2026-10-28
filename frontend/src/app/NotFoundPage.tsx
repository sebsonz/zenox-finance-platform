import { Link } from "react-router";
import { ArrowLeft, FileQuestion } from "lucide-react";

export function NotFoundPage() {
  return (
    <main className="not-found-page" role="main">
      <div className="not-found-card">
        <div className="not-found-icon" aria-hidden="true"><FileQuestion size={28} /></div>
        <p className="not-found-code">ERREUR 404</p>
        <h1>Cette page est introuvable</h1>
        <p>L’adresse demandée n’existe pas ou a été déplacée. Vérifiez le lien, puis revenez à votre espace Finance.</p>
        <Link className="not-found-link" to="/dashboard"><ArrowLeft size={16} /> Retour au tableau de bord</Link>
      </div>
    </main>
  );
}
