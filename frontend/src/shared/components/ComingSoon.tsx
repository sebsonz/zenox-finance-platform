import { Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function ComingSoon({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className="coming-wrap"><div className="eyebrow"><Sparkles size={14}/> ZENOX FINANCE</div><h1>{title}</h1><p className="subtitle">{description}</p><section className="panel coming-panel"><div className="coming-icon"><Icon size={26}/></div><h2>Module en préparation</h2><p>L’interface est posée. La prochaine étape sera de connecter ce module aux services backend, avec authentification, contrôle des autorisations et isolation des tenants.</p><span className="status-chip"><i/> Non connecté à l’API</span></section></div>;
}
