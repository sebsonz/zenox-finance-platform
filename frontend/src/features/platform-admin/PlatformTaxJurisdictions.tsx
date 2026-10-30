import { useEffect, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Globe2, RefreshCw } from "lucide-react";
import {
  loadPlatformTaxJurisdictions,
  type PlatformTaxJurisdictionPage,
  type TaxJurisdictionLevel,
} from "./platform-admin-tax-api.js";
import "./PlatformTaxJurisdictions.css";

const levels: { value: TaxJurisdictionLevel | ""; label: string }[] = [
  { value: "", label: "Tous les niveaux" },
  { value: "COUNTRY", label: "Pays" },
  { value: "STATE", label: "État" },
  { value: "PROVINCE", label: "Province" },
  { value: "REGION", label: "Région" },
  { value: "CITY", label: "Ville" },
  { value: "SPECIAL_ZONE", label: "Zone spéciale" },
];

export function PlatformTaxJurisdictions() {
  const [countryCode, setCountryCode] = useState("");
  const [level, setLevel] = useState<TaxJurisdictionLevel | "">("");
  const [page, setPage] = useState<PlatformTaxJurisdictionPage | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void loadPlatformTaxJurisdictions({
      ...(countryCode ? { countryCode } : {}),
      ...(level ? { level } : {}),
      page: pageNumber,
      pageSize: 25,
    }, controller.signal)
      .then((result) => setPage(result))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Une erreur est survenue.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [countryCode, level, pageNumber, refreshKey]);

  const changeCountry = (value: string) => {
    setCountryCode(value.trim().toUpperCase());
    setPageNumber(1);
  };
  const changeLevel = (value: string) => {
    setLevel(value as TaxJurisdictionLevel | "");
    setPageNumber(1);
  };

  return (
    <section className="pad-module pat-workspace">
      <div className="pad-module-tools">
        <div>
          <h2>Référentiel des juridictions</h2>
          <p>Consultation des juridictions actives du référentiel fiscal Finance.</p>
        </div>
        <div className="pat-toolbar">
          <span className="pad-source-label">Lecture seule · API plateforme</span>
          <button type="button" className="pad-refresh-button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
            <RefreshCw size={14}/> Actualiser
          </button>
        </div>
      </div>

      <div className="pat-filters">
        <label>
          <span>Code pays ISO</span>
          <input
            value={countryCode}
            onChange={(event) => changeCountry(event.target.value)}
            placeholder="Ex. BJ"
            maxLength={2}
            autoComplete="off"
            aria-label="Filtrer par code pays ISO"
          />
        </label>
        <label>
          <span>Niveau de juridiction</span>
          <select value={level} onChange={(event) => changeLevel(event.target.value)} aria-label="Filtrer par niveau">
            {levels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <section className="pad-panel">
        <div className="pad-panel-heading">
          <div>
            <h2>Juridictions enregistrées</h2>
            <p>Seules les entrées actives autorisées par les politiques de la base sont visibles.</p>
          </div>
          <Globe2 size={18}/>
        </div>

        {error ? (
          <div className="pad-inline-error" role="alert">
            <AlertCircle size={16}/> {error}
            <button type="button" className="pad-refresh-button" onClick={() => setRefreshKey((value) => value + 1)}>Réessayer</button>
          </div>
        ) : loading ? (
          <div className="pad-empty-row" role="status">Chargement du référentiel…</div>
        ) : !page || page.items.length === 0 ? (
          <div className="pad-empty-row">Aucune juridiction active ne correspond aux filtres. Aucune donnée de démonstration n'est affichée.</div>
        ) : (
          <>
            <div className="pad-table-scroll">
              <table className="pad-table">
                <thead><tr><th>Juridiction</th><th>Code</th><th>Pays</th><th>Niveau</th><th>Parent</th><th>Statut</th></tr></thead>
                <tbody>
                  {page.items.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.name}</strong><small>{item.id}</small></td>
                      <td>{item.code}</td>
                      <td>{item.countryCode}</td>
                      <td>{levels.find((entry) => entry.value === item.jurisdictionLevel)?.label ?? item.jurisdictionLevel}</td>
                      <td>{item.parentId ?? "—"}</td>
                      <td><span className="pad-status pat-active">ACTIVE</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pat-pagination">
              <span>Page {page.page} · {page.items.length} résultat(s) affiché(s)</span>
              <div>
                <button type="button" className="pad-refresh-button" onClick={() => setPageNumber((value) => Math.max(1, value - 1))} disabled={pageNumber <= 1 || loading}>
                  <ChevronLeft size={14}/> Précédent
                </button>
                <button type="button" className="pad-refresh-button" onClick={() => setPageNumber((value) => value + 1)} disabled={!page.hasMore || loading}>
                  Suivant <ChevronRight size={14}/>
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      <p className="pat-disclaimer">Cette vue présente le référentiel technique enregistré. Elle ne certifie ni l'exactitude juridique ni l'applicabilité d'une règle fiscale dans un pays.</p>
    </section>
  );
}
