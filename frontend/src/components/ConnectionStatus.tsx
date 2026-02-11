import { useWebSocket } from '../WebSocketContext';
import './ConnectionStatus.css';

export function ConnectionStatus() {
    const { connectionStatus } = useWebSocket();

    const getStatusColor = () => {
        switch (connectionStatus) {
            case 'connected': return '#10b981'; // green
            case 'connecting': return '#f59e0b'; // amber
            case 'reconnecting': return '#f59e0b'; // amber
            case 'disconnected': return '#ef4444'; // red
            default: return '#6b7280'; // gray
        }
    };

    const getStatusText = () => {
        switch (connectionStatus) {
            case 'connected': return 'Connected';
            case 'connecting': return 'Connecting...';
            case 'reconnecting': return 'Reconnecting...';
            case 'disconnected': return 'Offline';
            default: return 'Unknown';
        }
    };

    return (
        <div className="connection-status">
            <div className="status-indicator">
                <div
                    className="status-dot"
                    style={{ backgroundColor: getStatusColor() }}
                />
                <span className="status-text">{getStatusText()}</span>
            </div>
        </div>
    );
}
