import { Component } from 'react';

/**
 * Last line of defence: one bad row should degrade a panel, not blank the page.
 * Class component because React still has no hook equivalent.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="state state--error" role="alert">
        <p>畫面發生錯誤，無法繼續顯示。</p>
        <button
          type="button"
          className="pill-button"
          onClick={() => this.setState({ error: null })}
        >
          重新嘗試
        </button>
      </div>
    );
  }
}
