import { useEffect, useState, type FormEvent } from "react";
import countries from "i18n-iso-countries";
import { Building2, CheckCircle2, ChevronLeft, ChevronRight, FileText, LoaderCircle, Save, ShieldCheck, Trash2, Upload } from "lucide-react";
import "./OrganizationOnboardingWizard.css";

type Currency = { code: string; name: string; minorUnit: number };
type Payload = {
  organization: {
    legalName: string; tradeName: string | null; legalForm: string | null;
    countryCode: string; defaultCurrency: string; registrationNumber: string | null;
  };
  address: {
    addressType: "REGISTERED" | "BUSINESS" | "BILLING";
    addressLine1: string; addressLine2: string | null; city: string;
    region: string | null; postalCode: string | null; countryCode: string;
  };
  representative: { fullName: string; role: string; email: string; phone: string | null };
  contact: { businessEmail: string; businessPhone: string | null; websiteUrl: string | null };
};

const initialPayload: Payload = {
  organization: { legalName: "", tradeName: null, legalForm: null, countryCode: "BJ", defaultCurrency: "XOF", registrationNumber: null },
  address: { addressType: "REGISTERED", addressLine1: "", addressLine2: null, city: "", region: null, postalCode: null, countryCode: "BJ" },
  representative: { fullName: "", role: "Représentant légal", email: "", phone: null },
  contact: { businessEmail: "", businessPhone: null, websiteUrl: null },
};

const TERMS_VERSION = "2026-10-draft";
const PRIVACY_VERSION = "2026-10-draft";
const steps = ["Organisation", "Adresse", "Représentant & contact", "Justificatifs & vérification"];
const documentTypes = ["BUSINESS_REGISTRATION", "TAX_REGISTRATION", "IDENTITY_DOCUMENT", "PROOF_OF_ADDRESS", "AUTHORIZATION_LETTER", "OTHER"] as const;
type RegistrationDocument = { id: string; document_type: string; original_filename: string; status: string };
type RegistrationRequirement = { requirement_id: string; requirement_code: string; title: string; description: string; is_required: boolean; accepted_document_types: string[]; source_authority: string; source_reference: string };

const countryDisplayNames = new Intl.DisplayNames(["fr"], { type: "region" });

const countryOptions = Object.keys(countries.getAlpha2Codes())
  .map((code) => ({ code, name: countryDisplayNames.of(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name, "fr"));

function CountrySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase("fr");
  const filteredCountries = countryOptions.filter((country) =>
    `${country.name} ${country.code}`.toLocaleLowerCase("fr").includes(normalizedSearch),
  );

  return (
    <div className="country-select">
      <input
        type="search"
        aria-label="Rechercher un pays"
        placeholder="Rechercher un pays..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <select
        required
        aria-label="Pays"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {!filteredCountries.some((country) => country.code === value) && value && (
          <option value={value}>{value}</option>
        )}
        {filteredCountries.map((country) => (
          <option key={country.code} value={country.code}>
            {country.name} ({country.code})
          </option>
        ))}
      </select>
    </div>
  );
}

export function OrganizationOnboardingWizard({
  currencies,
  onSubmitted,
}: {
  currencies: Currency[];
  onSubmitted: (requestId: string) => Promise<void>;
}) {
  const [payload, setPayload] = useState<Payload>(initialPayload);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [documents, setDocuments] = useState<RegistrationDocument[]>([]);
  const [requirements, setRequirements] = useState<RegistrationRequirement[]>([]);
  const [requirementsStatus, setRequirementsStatus] = useState("LOADING");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/user/registration/drafts/current", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({})) as { data?: { draft?: { id: string; payload: Payload } }; error?: { message?: string } };
        if (!response.ok) throw new Error(result.error?.message ?? "Impossible de reprendre le brouillon.");
        if (active && result.data?.draft) {
          setDraftId(result.data.draft.id);
          setPayload({
            ...initialPayload,
            ...result.data.draft.payload,
            organization: { ...initialPayload.organization, ...result.data.draft.payload.organization },
            address: { ...initialPayload.address, ...result.data.draft.payload.address },
            representative: { ...initialPayload.representative, ...result.data.draft.payload.representative },
            contact: { ...initialPayload.contact, ...result.data.draft.payload.contact },
          } as Payload);
          setNotice("Votre brouillon précédent a été récupéré.");
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Impossible de reprendre le brouillon.");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (step !== 3 || !draftId) return;
    let active = true;
    void Promise.all([
      fetch(`/api/v1/user/registration/drafts/${draftId}/documents`, { credentials: "same-origin", cache: "no-store" }),
      fetch(`/api/v1/user/registration/requirements/${payload.organization.countryCode}?legalForm=${encodeURIComponent(payload.organization.legalForm ?? "")}`, { credentials: "same-origin", cache: "no-store" }),
    ]).then(async ([docsResponse, requirementsResponse]) => {
      const docsResult = await docsResponse.json().catch(() => ({})) as { data?: { documents?: RegistrationDocument[] } };
      const requirementsResult = await requirementsResponse.json().catch(() => ({})) as { data?: { requirements?: RegistrationRequirement[]; configurationStatus?: string } };
      if (!docsResponse.ok || !requirementsResponse.ok) throw new Error("Impossible de charger les justificatifs ou les exigences applicables.");
      if (active) { setDocuments(docsResult.data?.documents ?? []); setRequirements(requirementsResult.data?.requirements ?? []); setRequirementsStatus(requirementsResult.data?.configurationStatus ?? "NO_APPROVED_CONFIGURATION"); }
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Chargement impossible."); });
    return () => { active = false; };
  }, [step, draftId, payload.organization.countryCode, payload.organization.legalForm]);

  async function uploadDocument(file: File, type: string) {
    if (!draftId) return;
    setUploading(true); setError("");
    try {
      const response = await fetch(`/api/v1/user/registration/drafts/${draftId}/documents`, { method: "POST", credentials: "same-origin", headers: { "content-type": file.type, "x-document-type": type, "x-file-name": file.name }, body: file });
      const result = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "Le justificatif n’a pas pu être envoyé.");
      const refreshed = await fetch(`/api/v1/user/registration/drafts/${draftId}/documents`, { credentials: "same-origin", cache: "no-store" });
      const data = await refreshed.json() as { data?: { documents?: RegistrationDocument[] } };
      setDocuments(data.data?.documents ?? []); setNotice("Justificatif envoyé de manière privée.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Échec du dépôt."); }
    finally { setUploading(false); }
  }

  async function removeDocument(documentId: string) {
    if (!draftId) return;
    const response = await fetch(`/api/v1/user/registration/drafts/${draftId}/documents/${documentId}`, { method: "DELETE", credentials: "same-origin" });
    if (!response.ok) { setError("Impossible de supprimer ce justificatif."); return; }
    setDocuments((current) => current.filter((item) => item.id !== documentId));
  }

  function update<K extends keyof Payload>(section: K, values: Partial<Payload[K]>) {
    setPayload((current) => ({ ...current, [section]: { ...current[section], ...values } }));
  }

  async function saveDraft(): Promise<string> {
    const response = await fetch(
      draftId ? `/api/v1/user/registration/drafts/${draftId}` : "/api/v1/user/registration/drafts",
      {
        method: draftId ? "PATCH" : "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const result = await response.json().catch(() => ({})) as {
      data?: { draft?: { id: string } };
      error?: { message?: string };
    };
    if (!response.ok || !result.data?.draft?.id) {
      throw new Error(result.error?.message ?? "Le brouillon n’a pas pu être sauvegardé.");
    }
    setDraftId(result.data.draft.id);
    return result.data.draft.id;
  }

  async function handleNext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await saveDraft();
      if (step < steps.length - 1) {
        setStep((current) => current + 1);
        setNotice("Brouillon sauvegardé automatiquement.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Impossible de sauvegarder le brouillon.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!termsAccepted || !privacyAccepted) {
      setError("Vous devez accepter séparément les conditions d’utilisation et la politique de confidentialité.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const id = await saveDraft();
      const response = await fetch(`/api/v1/user/registration/drafts/${id}/submit`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acceptedTermsVersion: TERMS_VERSION, acceptedPrivacyVersion: PRIVACY_VERSION }),
      });
      const result = await response.json().catch(() => ({})) as {
        data?: { request?: { requestId: string } };
        error?: { message?: string };
      };
      if (!response.ok || !result.data?.request?.requestId) {
        throw new Error(result.error?.message ?? "La demande n’a pas pu être soumise.");
      }
      await onSubmitted(result.data.request.requestId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La demande n’a pas pu être soumise.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="onboarding-wizard">
    <div className="registration-status">
      <Building2 size={18}/>
      <div><strong>Inscription de votre organisation</strong><p>Les informations sont sauvegardées à chaque étape. Vous pourrez reprendre ce dossier avant sa soumission.</p></div>
    </div>
    <div className="onboarding-stepper" aria-label="Étapes du dossier">
      {steps.map((label, index) => <div key={label} aria-current={step === index ? "step" : undefined} className={step === index ? "active" : index < step ? "complete" : "upcoming"}>
        <span>{index < step ? <CheckCircle2 size={16}/> : String(index + 1).padStart(2, "0")}</span><p><strong>{label}</strong></p>
      </div>)}
    </div>
    {notice && <div className="registration-notice"><CheckCircle2 size={17}/><span>{notice}</span></div>}
    {error && <div className="registration-error" role="alert">{error}</div>}

    {step < 3 ? <form className="onboarding-form" onSubmit={handleNext}>
      {step === 0 && <>
        <label>Raison sociale<input required minLength={2} maxLength={200} value={payload.organization.legalName} onChange={(event) => update("organization", { legalName: event.target.value })} placeholder="Nom légal de l’organisation"/></label>
        <label>Nom commercial (facultatif)<input maxLength={200} value={payload.organization.tradeName ?? ""} onChange={(event) => update("organization", { tradeName: event.target.value || null })}/></label>
        <div className="registration-form-grid">
          <label>Pays d’établissement<CountrySelect value={payload.organization.countryCode} onChange={(code) => { update("organization", { countryCode: code }); update("address", { countryCode: code }); }}/><small>Choisissez le pays de domiciliation de votre organisation. Le code ISO 3166-1 alpha-2 est enregistré.</small></label>
          <label>Devise par défaut<select required value={payload.organization.defaultCurrency} onChange={(event) => update("organization", { defaultCurrency: event.target.value })} disabled={!currencies.length}><option value="">Sélectionner</option>{currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>)}</select></label>
        </div>
        <label>Forme juridique<input maxLength={80} value={payload.organization.legalForm ?? ""} onChange={(event) => update("organization", { legalForm: event.target.value || null })} placeholder="Ex. SARL, SA, entreprise individuelle"/></label>
        <label>Numéro d’immatriculation (si disponible)<input maxLength={100} value={payload.organization.registrationNumber ?? ""} onChange={(event) => update("organization", { registrationNumber: event.target.value || null })}/></label>
      </>}
      {step === 1 && <>
        <label>Type d’adresse<select value={payload.address.addressType} onChange={(event) => update("address", { addressType: event.target.value as Payload["address"]["addressType"] })}><option value="REGISTERED">Siège social</option><option value="BUSINESS">Établissement</option><option value="BILLING">Facturation</option></select></label>
        <label>Adresse principale<input required maxLength={200} value={payload.address.addressLine1} onChange={(event) => update("address", { addressLine1: event.target.value })}/></label>
        <label>Complément d’adresse<input maxLength={200} value={payload.address.addressLine2 ?? ""} onChange={(event) => update("address", { addressLine2: event.target.value || null })}/></label>
        <div className="registration-form-grid">
          <label>Ville<input required maxLength={120} value={payload.address.city} onChange={(event) => update("address", { city: event.target.value })}/></label>
          <label>Région / département<input maxLength={120} value={payload.address.region ?? ""} onChange={(event) => update("address", { region: event.target.value || null })}/></label>
        </div>
        <div className="registration-form-grid">
          <label>Code postal<input maxLength={24} value={payload.address.postalCode ?? ""} onChange={(event) => update("address", { postalCode: event.target.value || null })}/></label>
          <label>Pays<CountrySelect value={payload.address.countryCode} onChange={(code) => update("address", { countryCode: code})}/></label>
        </div>
      </>}
      {step === 2 && <>
        <label>Nom complet du représentant<input required minLength={2} maxLength={200} value={payload.representative.fullName} onChange={(event) => update("representative", { fullName: event.target.value })}/></label>
        <label>Fonction<input required minLength={2} maxLength={100} value={payload.representative.role} onChange={(event) => update("representative", { role: event.target.value })}/></label>
        <label>E-mail du représentant<input required type="email" value={payload.representative.email} onChange={(event) => update("representative", { email: event.target.value })}/></label>
        <label>Téléphone du représentant<input type="tel" minLength={6} maxLength={40} value={payload.representative.phone ?? ""} onChange={(event) => update("representative", { phone: event.target.value || null })}/></label>
        <label>E-mail professionnel<input required type="email" value={payload.contact.businessEmail} onChange={(event) => update("contact", { businessEmail: event.target.value })}/></label>
        <div className="registration-form-grid">
          <label>Téléphone professionnel<input type="tel" minLength={6} maxLength={40} value={payload.contact.businessPhone ?? ""} onChange={(event) => update("contact", { businessPhone: event.target.value || null })}/></label>
          <label>Site web<input type="url" value={payload.contact.websiteUrl ?? ""} onChange={(event) => update("contact", { websiteUrl: event.target.value || null })} placeholder="https://"/></label>
        </div>
      </>}
      <div className="registration-form-grid">
        <button className="registration-primary" type="submit" disabled={busy || (step === 0 && currencies.length === 0)}>
          {busy ? <LoaderCircle size={17} className="spin"/> : <Save size={17}/>} {step === 2 ? "Sauvegarder et vérifier" : "Sauvegarder et continuer"} <ChevronRight size={17}/>
        </button>
        {step > 0 && <button type="button" className="registration-signout" disabled={busy} onClick={() => setStep((current) => current - 1)}><ChevronLeft size={17}/> Retour</button>}
      </div>
    </form> : <form className="onboarding-form" onSubmit={submit}>
      <h3>Justificatifs et vérification avant l’envoi</h3>
      <section className="registration-status"><div><strong><FileText size={16}/> Exigences réglementaires — {payload.organization.countryCode}</strong>{requirementsStatus === "NO_APPROVED_CONFIGURATION" ? <p>Aucune configuration réglementaire approuvée n’est encore publiée pour cette juridiction. Cela ne signifie pas qu’aucune formalité n’est requise. Le dossier pourra être complété par l’équipe de conformité.</p> : <ul>{requirements.map((item) => <li key={item.requirement_id}><strong>{item.title}</strong> {item.is_required ? "(requis)" : "(facultatif)"}<small>{item.description} — Source : {item.source_authority}, {item.source_reference}</small></li>)}</ul>}</div></section>
      <section className="registration-status"><div><strong>Pièces justificatives</strong><p>Formats PDF, JPEG ou PNG — 10 Mo maximum par fichier. Les fichiers sont privés.</p><label>Type de pièce<select id="registration-document-type">{documentTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label><label className="registration-primary"><Upload size={16}/> Ajouter un fichier<input type="file" accept="application/pdf,image/jpeg,image/png" disabled={uploading || !draftId} onChange={(event) => { const file = event.target.files?.[0]; const type = (document.getElementById("registration-document-type") as HTMLSelectElement | null)?.value ?? "OTHER"; if (file) void uploadDocument(file, type); event.currentTarget.value = ""; }}/></label>{uploading && <p>Envoi en cours…</p>}{documents.map((doc) => <p key={doc.id}><FileText size={15}/> {doc.original_filename} — {doc.document_type} <button type="button" aria-label="Supprimer le justificatif" onClick={() => void removeDocument(doc.id)}><Trash2 size={14}/></button></p>)}</div></section>
      <div className="registration-status"><div><strong>{payload.organization.legalName}</strong><p>{payload.organization.tradeName ?? "Sans nom commercial"} · {payload.organization.countryCode} · {payload.organization.defaultCurrency}</p><small>{payload.address.addressLine1}, {payload.address.city}, {payload.address.countryCode}</small><p>{payload.representative.fullName} — {payload.representative.role}</p><small>{payload.contact.businessEmail}</small></div></div>
      <label className="registration-consent"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)}/><span>J’accepte les conditions d’utilisation, version {TERMS_VERSION}.</span></label>
      <label className="registration-consent"><input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)}/><span>J’accepte la politique de confidentialité, version {PRIVACY_VERSION}.</span></label>
      <p className="registration-footnote"><ShieldCheck size={15}/> Après soumission, le dossier sera en attente de validation. L’accès aux fonctionnalités financières restera bloqué jusqu’à l’activation de l’organisation.</p>
      <div className="registration-form-grid">
        <button type="button" className="registration-signout" disabled={busy} onClick={() => setStep(2)}><ChevronLeft size={17}/> Modifier</button>
        <button className="registration-primary" type="submit" disabled={busy || !termsAccepted || !privacyAccepted}>{busy ? <LoaderCircle size={17} className="spin"/> : <Building2 size={17}/>} Soumettre le dossier</button>
      </div>
    </form>}
  </section>;
}
