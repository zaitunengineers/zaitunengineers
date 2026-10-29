// "Save & Print" and friends: ask the Aeon-style Bill Printing box, then do what was chosen.

import { toast } from '/assets/js/ui.js';
import { askBillPrinting } from './dialog.js';
import { openPreview } from './preview.js';
import { loadPrintData, optionsFrom, getPrefs, printNow, savePdf, logPrint } from './service.js';

export async function printFlow(ids, settings, doc = 'bill') {
  const v = await askBillPrinting({ settings, title: doc === 'challan' ? 'Challan Printing' : 'Bill Printing' });
  if (!v) return 'closed';
  if (v.output === 'screen') {
    await openPreview({ query: { ids, doc } });
    return 'screen';
  }
  const t = toast(doc === 'challan' ? 'Making the challan…' : 'Making the bill…', 'info', 0);
  try {
    const data = await loadPrintData({ ids, doc });
    const opts = optionsFrom(data, getPrefs());
    if (v.output === 'printer') {
      await printNow(data, opts);
      logPrint(ids, ids.length > 1 ? 'bulk' : 'print', doc);
    } else {
      const r = await savePdf(data, opts);
      if (r !== 'cancelled') logPrint(ids, ids.length > 1 ? 'bulk' : 'pdf', doc);
    }
    return v.output;
  } catch (e) {
    toast((e && e.message) || 'Could not print. Try again.', 'danger');
    return 'failed';
  } finally {
    t.remove();
  }
}
