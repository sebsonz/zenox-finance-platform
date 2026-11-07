import { useState } from "react";
import { Copy, Pencil, Plus, Trash2, GripVertical } from "lucide-react";

type InvoiceLine = { id?: string; description: string; quantity: string; unitPrice: string; discountPercent: string; taxRatePercent: string };
type Props = {
  documentType: "STANDARD" | "DEPOSIT" | "BALANCE" | "CREDIT_NOTE";
  lines: InvoiceLine[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof InvoiceLine, value: string) => void;
  onRemove: (index: number) => void;
  onDuplicate: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
};

export function InvoiceLinesEditor({ documentType, lines, onAdd, onUpdate, onRemove, onDuplicate, onReorder }: Props) {
  const [detailsIndex, setDetailsIndex] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  if (documentType === "CREDIT_NOTE") return null;
  const details = detailsIndex === null ? null : lines[detailsIndex];

  return <section className="invoice-lines-section" id="invoice-composer-lines">
    <div className="invoice-lines-heading">
      <div><h3>Lignes de facture <span className="invoice-lines-count">{lines.length}</span></h3><p>Prix unitaires hors taxes · jusqu’à 500 lignes</p></div>
      <div className="invoice-lines-toolbar">
        
        <button className="primary-button" type="button" onClick={onAdd} disabled={lines.length >= 500}><Plus size={14}/> Ajouter une ligne</button>
      </div>
    </div>
    <div className="invoice-lines-table-wrap">
      <table className="invoice-lines-table">
        <thead><tr><th className="line-grip-col"></th><th>N°</th><th>Désignation</th><th>Qté</th><th>Prix unitaire HT</th><th>Remise %</th><th>TVA %</th><th>Actions</th></tr></thead>
        <tbody>
          {lines.map((line, index) => <tr key={line.id ?? index} draggable onDragStart={() => setDraggedIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedIndex !== null) onReorder(draggedIndex, index); setDraggedIndex(null); }} onDragEnd={() => setDraggedIndex(null)} className={draggedIndex === index ? "invoice-line-row-dragging" : undefined}>
            <td className="line-grip" title="Faire glisser pour réordonner"><GripVertical size={15}/></td>
            <td className="line-number">{index + 1}</td>
            <td className="line-description-cell"><input aria-label={`Désignation ligne ${index + 1}`} value={line.description} maxLength={500} placeholder="Désignation du produit ou service" onChange={(event) => onUpdate(index, "description", event.target.value)} required/></td>
            <td><input className="line-number-input" aria-label={`Quantité ligne ${index + 1}`} inputMode="decimal" value={line.quantity} onChange={(event) => onUpdate(index, "quantity", event.target.value)} required/></td>
            <td><input className="line-money-input" aria-label={`Prix unitaire HT ligne ${index + 1}`} inputMode="decimal" value={line.unitPrice} onChange={(event) => onUpdate(index, "unitPrice", event.target.value)} required/></td>
            <td><input className="line-number-input" aria-label={`Remise ligne ${index + 1}`} inputMode="decimal" value={line.discountPercent} onChange={(event) => onUpdate(index, "discountPercent", event.target.value)} required/></td>
            <td><input className="line-number-input" aria-label={`TVA ligne ${index + 1}`} inputMode="decimal" value={line.taxRatePercent} onChange={(event) => onUpdate(index, "taxRatePercent", event.target.value)} required/></td>
            <td><div className="invoice-line-actions">
              <button className="small-action" type="button" title="Dupliquer la ligne" aria-label={`Dupliquer la ligne ${index + 1}`} onClick={() => onDuplicate(index)}><Copy size={14}/></button>
              <button className="small-action" type="button" title="Détails de la ligne" aria-label={`Détails de la ligne ${index + 1}`} onClick={() => setDetailsIndex(detailsIndex === index ? null : index)}><Pencil size={14}/></button>
              <button className="small-action danger" type="button" title="Supprimer la ligne" aria-label={`Supprimer la ligne ${index + 1}`} disabled={lines.length === 1} onClick={() => { onRemove(index); if (detailsIndex === index) setDetailsIndex(null); }}><Trash2 size={14}/></button>
            </div></td>
          </tr>)}
        </tbody>
      </table>
    </div>
    {details && detailsIndex !== null && <div className="invoice-line-details">
      <div className="invoice-line-details-heading"><div><strong>Détails de la ligne {detailsIndex + 1}</strong><p>Complétez ou ajustez les données commerciales.</p></div><button type="button" className="small-action" onClick={() => setDetailsIndex(null)} aria-label="Fermer les détails">×</button></div>
      <label>Désignation<input value={details.description} maxLength={500} onChange={(event) => onUpdate(detailsIndex, "description", event.target.value)}/></label>
      <label>Quantité<input inputMode="decimal" value={details.quantity} onChange={(event) => onUpdate(detailsIndex, "quantity", event.target.value)}/></label>
      <label>Prix unitaire HT<input inputMode="decimal" value={details.unitPrice} onChange={(event) => onUpdate(detailsIndex, "unitPrice", event.target.value)}/></label>
      <label>Remise (%)<input inputMode="decimal" value={details.discountPercent} onChange={(event) => onUpdate(detailsIndex, "discountPercent", event.target.value)}/></label>
      <label>TVA (%)<input inputMode="decimal" value={details.taxRatePercent} onChange={(event) => onUpdate(detailsIndex, "taxRatePercent", event.target.value)}/></label>
    </div>}
  </section>;
}
