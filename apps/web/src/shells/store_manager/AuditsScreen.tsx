import { Card } from '../../components/common';
import { Icon } from './icons';

// Placeholder: the Figma set has no Stock Audits screen yet.
export function AuditsScreen() {
  return (
    <div className="sm-page sm-narrow">
      <Card className="sm-empty">
        <span className="sm-iconbox"><Icon name="list" size={28} /></span>
        <h1 className="sm-h1-md">Stock Audits</h1>
        <p className="sm-muted">Cycle counts and audit history for OUT047 will appear here. This screen is not designed yet.</p>
      </Card>
    </div>
  );
}
