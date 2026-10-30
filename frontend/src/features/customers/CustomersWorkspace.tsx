import { useEffect, useMemo, useState } from "react";
import { CustomerManagementDialog, type CustomerEditorKind, type CustomerEditorMode, type CustomerEditorRecord } from "./CustomerManagementDialog.js";
import "./customers-management.css";
import { Building2, Mail, MapPin, Phone, RefreshCw, Search, UserRound, Users } from "lucide-react";

type Customer = {
  id: string; customerCode: string; customerType: "BUSINESS" | "INDIVIDUAL";
  legalName: string; displayName: string | null; email: string | null; phone: string | null;
  countryCode: string; taxIdentifier: string | null; registrationIdentifier: string | null;
  defaultCurrency: string | null; status: "ACTIVE" | "ARCHIVED";
};
type Contact = {
  id: string; contactType: string; fullName: string; jobTitle: string | null;
  email: string | null; phone: string | null; isPrimary: boolean;
};
type Address = {
  id: string; addressType: string; label: string | null; recipientName: string | null;
  addressLine1: string; addressLine2: string | null; city: string; region: string | null;
  postalCode: string | null; countryCode: string; isPrimary: boolean;
};
type ApiEnvelope<T> = { data?: T; error?: { message?: string } };

async function readData<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({})) as ApiEnvelope<T>;
  if (!response.ok || payload.data === undefined) throw new Error(payload.error?.message ?? fallback);
  return payload.data;
}

export function CustomersWorkspace({ tenantId, canManage = false }: { tenantId: string; canManage?: boolean }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<{ kind: CustomerEditorKind; mode: CustomerEditorMode; record?: CustomerEditorRecord } | null>(null);

  async function loadCustomers(query = search) {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ status: "ACTIVE", limit: "100" });
      if (query.trim()) params.set("q", query.trim());
      const data = await readData<{ customers: Customer[] }>(
        await fetch(`/api/v1/user/tenants/${encodeURIComponent(tenantId)}/customers?${params}`, { credentials: "same-origin", cache: "no-store" }),
        "Impossible de charger les clients.",
      );
      setCustomers(data.customers ?? []);
      setSelected((current) => current && data.customers.some((item) => item.id === current.id)
        ? data.customers.find((item) => item.id === current.id) ?? null : null);
    } catch (cause) {
      setCustomers([]); setSelected(null);
      setError(cause instanceof Error ? cause.message : "Impossible de charger les clients.");
    } finally { setLoading(false); }
  }

  async function loadDetails(customer: Customer) {
    setSelected(customer); setDetailLoading(true); setContacts([]); setAddresses([]); setError("");
    const base = `/api/v1/user/tenants/${encodeURIComponent(tenantId)}/customers/${encodeURIComponent(customer.id)}`;
    try {
      const [contactData, addressData] = await Promise.all([
        readData<{ contacts: Contact[] }>(await fetch(`${base}/contacts?status=ACTIVE&limit=100`, { credentials: "same-origin", cache: "no-store" }), "Impossible de charger les contacts."),
        readData<{ addresses: Address[] }>(await fetch(`${base}/addresses?status=ACTIVE&limit=100`, { credentials: "same-origin", cache: "no-store" }), "Impossible de charger les adresses."),
      ]);
      setContacts(contactData.contacts ?? []); setAddresses(addressData.addresses ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Impossible de charger les détails."); }
    finally { setDetailLoading(false); }
  }

  useEffect(() => { void loadCustomers(""); }, [tenantId]);

  function openEditor(kind: CustomerEditorKind, mode: CustomerEditorMode, record?: CustomerEditorRecord) {
    setEditor({ kind, mode, ...(record ? { record } : {}) });
  }

  async function saveEditor(values: CustomerEditorRecord) {
    if (!selected && editor?.kind !== "customer") throw new Error("Sélectionnez d'abord un client.");
    const customerId = selected?.id;
    const base = `/api/v1/user/tenants/${encodeURIComponent(tenantId)}/customers`;
    let url = base;
    let method = "POST";
    if (editor?.kind === "customer" && editor.mode === "edit" && customerId) { url = `${base}/${encodeURIComponent(customerId)}`; method = "PATCH"; }
    if (editor?.kind === "contact" && customerId) { url = `${base}/${encodeURIComponent(customerId)}/contacts`; }
    if (editor?.kind === "contact" && editor.mode === "edit" && customerId) { url = `${url}/${encodeURIComponent(String(editor.record?.id ?? ""))}`; method = "PATCH"; }
    if (editor?.kind === "address" && customerId) { url = `${base}/${encodeURIComponent(customerId)}/addresses`; }
    if (editor?.kind === "address" && editor.mode === "edit" && customerId) { url = `${url}/${encodeURIComponent(String(editor.record?.id ?? ""))}`; method = "PATCH"; }
    await readData(await fetch(url, { method, credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }), "Enregistrement impossible.");
    const kind = editor?.kind;
    setEditor(null);
    await loadCustomers();
    if (kind === "customer" && customerId) {
      const refreshed = await readData<{ customer: Customer }>(await fetch(`${base}/${encodeURIComponent(customerId)}`, { credentials: "same-origin", cache: "no-store" }), "Impossible de recharger le client.");
      await loadDetails(refreshed.customer);
    } else if (selected) await loadDetails(selected);
  }

  async function archiveItem(kind: CustomerEditorKind, id: string) {
    if (!selected && kind !== "customer") return;
    if (!window.confirm(kind === "customer" ? "Archiver ce client ?" : kind === "contact" ? "Archiver ce contact ?" : "Archiver cette adresse ?")) return;
    const base = `/api/v1/user/tenants/${encodeURIComponent(tenantId)}/customers`;
    const url = kind === "customer" ? `${base}/${encodeURIComponent(id)}/archive`
      : `${base}/${encodeURIComponent(selected!.id)}/${kind === "contact" ? "contacts" : "addresses"}/${encodeURIComponent(id)}/archive`;
    try {
      await readData(await fetch(url, { method: "POST", credentials: "same-origin", cache: "no-store" }), "Archivage impossible.");
      if (kind === "customer") { setSelected(null); await loadCustomers(); }
      else if (selected) await loadDetails(selected);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Archivage impossible.");
    }
  }

  const countLabel = useMemo(() => `${customers.length} client(s)`, [customers.length]);

  return <section className="customers-workspace">
    <div className="welcome-row">
      <div><div className="eyebrow"><Users size={14}/> RELATION CLIENT</div><h1>Clients</h1><p className="subtitle">Consultez les clients, leurs contacts et leurs adresses enregistrés dans votre organisation.</p></div>
      <div className="customer-toolbar"><span className="status-chip"><i/> Lecture et gestion sécurisées</span>{canManage && <button className="primary-button" onClick={() => openEditor("customer", "create")}>+ Nouveau client</button>}</div>
    </div>
    <div className="demo-banner"><div className="demo-icon"><Building2 size={19}/></div><div><strong>Répertoire de votre organisation</strong><p>Les données sont gérées depuis l’API Finance authentifiée. Les modifications sont réservées aux rôles autorisés et chaque action est journalisée.</p></div><span className="demo-pill">M04</span></div>
    {error && <div className="notice" role="alert"><span>{error}</span><button onClick={() => setError("")}>Fermer</button></div>}
    <div className="customers-layout">
      <section className="panel customer-list-panel">
        <div className="panel-heading"><div><h2>Répertoire clients</h2><p>{countLabel}</p></div><button className="text-button" onClick={() => void loadCustomers()} aria-label="Actualiser"><RefreshCw size={15}/></button></div>
        <form className="customer-search" onSubmit={(event) => { event.preventDefault(); void loadCustomers(); }}>
          <Search size={16}/><input aria-label="Rechercher un client" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom ou code client"/><button type="submit">Rechercher</button>
        </form>
        {loading ? <div className="customer-empty">Chargement des clients…</div> : customers.length === 0 ? <div className="customer-empty"><Users size={28}/><strong>Aucun client trouvé</strong><span>Essayez une autre recherche ou vérifiez les clients actifs.</span></div> :
          <div className="customer-list">{customers.map((customer) => <button key={customer.id} className={`customer-list-item ${selected?.id === customer.id ? "selected" : ""}`} onClick={() => void loadDetails(customer)}>
            <span className="customer-avatar">{customer.customerType === "BUSINESS" ? <Building2 size={17}/> : <UserRound size={17}/>}</span>
            <span className="customer-list-copy"><strong>{customer.displayName || customer.legalName}</strong><small>{customer.customerCode} · {customer.countryCode}</small></span>
            <span className="customer-type">{customer.customerType === "BUSINESS" ? "Entreprise" : "Particulier"}</span>
          </button>)}</div>}
      </section>
      <section className="panel customer-detail-panel">
        {!selected ? <div className="customer-empty detail-empty"><div className="empty-illustration"><UserRound size={27}/></div><strong>Sélectionnez un client</strong><span>Ses informations, contacts et adresses apparaîtront ici.</span></div> :
          <>
            <div className="customer-detail-heading"><div><div className="eyebrow">FICHE CLIENT · {selected.customerCode}</div><h2>{selected.displayName || selected.legalName}</h2><p>{selected.legalName}</p></div><div className="customer-row-actions"><span className="status-chip"><i/>{selected.status === "ACTIVE" ? "Actif" : "Archivé"}</span>{canManage && <><button className="outline-button" onClick={() => openEditor("customer", "edit", selected)}>Modifier</button><button className="outline-button danger-button" onClick={() => void archiveItem("customer", selected.id)}>Archiver</button></>}</div></div>
            <div className="customer-facts">
              <div><Mail size={15}/><span>{selected.email || "E-mail non renseigné"}</span></div>
              <div><Phone size={15}/><span>{selected.phone || "Téléphone non renseigné"}</span></div>
              <div><MapPin size={15}/><span>{selected.countryCode} · {selected.defaultCurrency || "Devise non définie"}</span></div>
            </div>
            {detailLoading ? <p className="customer-loading">Chargement des coordonnées…</p> : <>
              <div className="customer-section-heading"><h3>Contacts</h3><span>{contacts.length}</span>{canManage && <button className="text-button" onClick={() => openEditor("contact", "create")}>+ Ajouter</button>}</div>
              {contacts.length ? <div className="customer-relation-list">{contacts.map((contact) => <article key={contact.id}><strong>{contact.fullName}{contact.isPrimary ? " · Principal" : ""}</strong><small>{[contact.jobTitle, contact.contactType].filter(Boolean).join(" · ")}</small><span>{contact.email || contact.phone || "Aucune coordonnée"}</span>{canManage && <div className="customer-row-actions"><button className="text-button" onClick={() => openEditor("contact", "edit", contact)}>Modifier</button><button className="text-button danger-text" onClick={() => void archiveItem("contact", contact.id)}>Archiver</button></div>}</article>)}</div> : <p className="customer-no-relations">Aucun contact actif enregistré.</p>}
              <div className="customer-section-heading"><h3>Adresses</h3><span>{addresses.length}</span>{canManage && <button className="text-button" onClick={() => openEditor("address", "create")}>+ Ajouter</button>}</div>
              {addresses.length ? <div className="customer-relation-list">{addresses.map((address) => <article key={address.id}><strong>{address.label || address.addressType}{address.isPrimary ? " · Principale" : ""}</strong><small>{address.recipientName || ""}</small><span>{[address.addressLine1, address.addressLine2, address.city, address.region, address.postalCode, address.countryCode].filter(Boolean).join(", ")}</span>{canManage && <div className="customer-row-actions"><button className="text-button" onClick={() => openEditor("address", "edit", address)}>Modifier</button><button className="text-button danger-text" onClick={() => void archiveItem("address", address.id)}>Archiver</button></div>}</article>)}</div> : <p className="customer-no-relations">Aucune adresse active enregistrée.</p>}
            </>}
          </>}
      </section>
    </div>
    {editor && <CustomerManagementDialog kind={editor.kind} mode={editor.mode} initial={editor.record} onClose={() => setEditor(null)} onSave={saveEditor} />}
  </section>;
}
