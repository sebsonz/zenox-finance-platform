import { useEffect, useState, type FormEvent } from "react";

export type CustomerEditorKind = "customer" | "contact" | "address";
export type CustomerEditorMode = "create" | "edit";
export type CustomerEditorRecord = Record<string, string | boolean | null | undefined>;

type Props = {
  kind: CustomerEditorKind;
  mode: CustomerEditorMode;
  initial?: CustomerEditorRecord;
  onClose: () => void;
  onSave: (values: CustomerEditorRecord) => Promise<void>;
};

const fields: Record<CustomerEditorKind, Array<{ name: string; label: string; type?: string; required?: boolean; options?: string[] }>> = {
  customer: [
    { name: "customerCode", label: "Code client", required: true },
    { name: "customerType", label: "Type", options: ["BUSINESS", "INDIVIDUAL"] },
    { name: "legalName", label: "Nom légal", required: true },
    { name: "displayName", label: "Nom affiché" },
    { name: "email", label: "E-mail", type: "email" },
    { name: "phone", label: "Téléphone" },
    { name: "countryCode", label: "Pays (ISO)", required: true },
    { name: "taxIdentifier", label: "Identifiant fiscal" },
    { name: "registrationIdentifier", label: "Identifiant registre" },
    { name: "defaultCurrency", label: "Devise par défaut (ISO)" },
  ],
  contact: [
    { name: "contactType", label: "Type", options: ["GENERAL", "BILLING", "TECHNICAL", "LEGAL", "OTHER"] },
    { name: "fullName", label: "Nom complet", required: true },
    { name: "jobTitle", label: "Fonction" },
    { name: "email", label: "E-mail", type: "email" },
    { name: "phone", label: "Téléphone" },
  ],
  address: [
    { name: "addressType", label: "Type", options: ["REGISTERED", "BILLING", "SHIPPING", "OTHER"] },
    { name: "label", label: "Libellé" },
    { name: "recipientName", label: "Destinataire" },
    { name: "addressLine1", label: "Adresse ligne 1", required: true },
    { name: "addressLine2", label: "Adresse ligne 2" },
    { name: "city", label: "Ville", required: true },
    { name: "region", label: "Région" },
    { name: "postalCode", label: "Code postal" },
    { name: "countryCode", label: "Pays (ISO)", required: true },
  ],
};

const defaults: Record<CustomerEditorKind, CustomerEditorRecord> = {
  customer: { customerCode: "", customerType: "BUSINESS", legalName: "", displayName: "", email: "", phone: "", countryCode: "BJ", taxIdentifier: "", registrationIdentifier: "", defaultCurrency: "XOF" },
  contact: { contactType: "GENERAL", fullName: "", jobTitle: "", email: "", phone: "", isPrimary: false },
  address: { addressType: "REGISTERED", label: "", recipientName: "", addressLine1: "", addressLine2: "", city: "", region: "", postalCode: "", countryCode: "BJ", isPrimary: false },
};

export function CustomerManagementDialog({ kind, mode, initial, onClose, onSave }: Props) {
  const [values, setValues] = useState<CustomerEditorRecord>({ ...defaults[kind], ...(initial ?? {}) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setValues({ ...defaults[kind], ...(initial ?? {}) }); }, [kind, initial]);
  const visibleFields = fields[kind].filter((field) => !(kind === "customer" && mode === "edit" && ["customerCode", "customerType"].includes(field.name)));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const payload: CustomerEditorRecord = Object.fromEntries(visibleFields.map((field) => [field.name, values[field.name]]));
      if (kind !== "customer") payload.isPrimary = Boolean(values.isPrimary);
      for (const field of visibleFields) {
        if (!field.required && payload[field.name] === "") {
          if (mode === "edit") payload[field.name] = null;
          else delete payload[field.name];
        }
      }
      await onSave(payload);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Enregistrement impossible."); }
    finally { setBusy(false); }
  }

  const title = mode === "create" ? "Ajouter" : "Modifier";
  return <div className="customer-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="customer-dialog" role="dialog" aria-modal="true" aria-labelledby="customer-dialog-title">
      <header><div><span className="eyebrow">GESTION CLIENTS · M04</span><h2 id="customer-dialog-title">{title} {kind === "customer" ? "un client" : kind === "contact" ? "un contact" : "une adresse"}</h2></div><button type="button" className="text-button" onClick={onClose} disabled={busy}>Fermer</button></header>
      <form onSubmit={submit}>
        <div className="customer-dialog-fields">
          {visibleFields.map((field) => <label key={field.name}>
            <span>{field.label}{field.required ? " *" : ""}</span>
            {field.options ? <select required={field.required} value={String(values[field.name] ?? "")} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
              : <input type={field.type ?? "text"} required={field.required} value={String(values[field.name] ?? "")} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} />}
          </label>)}
          {(kind === "contact" || kind === "address") && <label className="customer-dialog-checkbox"><input type="checkbox" checked={Boolean(values.isPrimary)} onChange={(event) => setValues((current) => ({ ...current, isPrimary: event.target.checked }))}/><span>Définir comme principal(e)</span></label>}
        </div>
        {error && <p className="customer-dialog-error" role="alert">{error}</p>}
        <footer><button type="button" className="outline-button" onClick={onClose} disabled={busy}>Annuler</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button></footer>
      </form>
    </section>
  </div>;
}
