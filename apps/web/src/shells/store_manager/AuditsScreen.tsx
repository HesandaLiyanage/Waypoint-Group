import { Card } from '../../components/common';
export { StockAuditsScreen as AuditsScreen } from './StockAuditsScreen';
import { Icon } from './icons';

// Placeholder for tabs that have no screen in the Figma set yet.
export function PlaceholderScreen({ title, text, icon = 'list' }: { title: string; text: string; icon?: string }) {
  return (
    <div className="sm-page sm-narrow">
      <Card className="sm-empty">
        <span className="sm-iconbox"><Icon name={icon} size={28} /></span>
        <h1 className="sm-h1-md">{title}</h1>
        <p className="sm-muted">{text}</p>
      </Card>
    </div>
  );
}
export const TelemetryScreen = () => <PlaceholderScreen icon="snow" title="Cold Chain Telemetry" text="Live temperature history for the outlet will appear here. This screen is not designed yet. Live delivery tracking is under Receiving Manifest." />;
