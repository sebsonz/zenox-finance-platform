import { Plus, Trash2 } from "lucide-react";

type InvoiceLine = { id?: string; description: string; quantity: string; unitPrice: string; discountPercent: string; taxRatePercent: string };
type Props = {
  documentType: "STANDARD" | "DEPOSIT" | "BALANCE" | "CREDIT_NOTE";
  lines: InvoiceLine[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof InvoiceLine, value: string) => void;
  onRemove: (index: number) => void;
};

export function InvoiceLinesEditor({ documentType, lines, onAdd, onUpdate, onRemove }: Props) {
  if (documentType === "CREDIT_NOTE") return null;
  return <>
    <div className="invoice-lines-heading"><h3>Lignes de facture</h3><button className="outline-button" type="button" onClick={onAdd} disabled={lines.length >= 500}><Plus size={14}/> Ajouter une ligne</button></div>
    {lines.map((line, index) => <div className="invoice-line-editor" key={line.id ?? index}>
      <label className="line-description">Description<input value={line.description} maxLength={500} onChange={(event) => onUpdate(index, "description", event.target.value)} required/></label>
      <label>Qté<input inputMode="decimal" value={line.quantity} onChange={(event) => onUpdate(index, "quantity", event.target.value)} required/></label>
      <label>Prix unitaire<input inputMode="decimal" value={line.unitPrice} onChange={(event) => onUpdate(index, "unitPrice", event.target.value)} required/></label>
      <label>Remise %<input inputMode="decimal" value={line.discountPercent} onChange={(event) => onUpdate(index, "discountPercent", event.target.value)} required/></label>
      <label>Taxe provisoire %<input inputMode="decimal" value={line.taxRatePercent} onChange={(event) => onUpdate(index, "taxRatePercent", event.target.value)} required/></label>
      <button className="icon-danger" type="button" title="Supprimer la ligne" disabled={lines.length === 1} onClick={() => onRemove(index)}><Trash2 size={15}/></button>
    </div>)}
  </>;
}
