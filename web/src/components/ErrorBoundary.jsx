import { Component } from 'react';

const MAX_RETRIES = 3;

/**
 * Last line of defence: one bad row should degrade a panel, not blank the page.
 * Class component because React still has no hook equivalent.
 *
 * Circuit breaker: after MAX_RETRIES consecutive failures the retry button
 * is replaced with a full-page reload prompt to prevent infinite retry loops
 * on permanent errors.
 */
export default class ErrorBoundary extends Component {
  state = { error: null, retries: 0 };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error', error, info);
  }

  handleRetry = () => {
    this.setState((prev) => ({ error: null, retries: prev.retries + 1 }));
  };

  render() {
    if (!this.state.error) return this.props.children;

    const exhausted = this.state.retries >= MAX_RETRIES;

    return (
      <div className="state state--error" role="alert">
        <p>畫面發生錯誤，無法繼續顯示。</p>
        {exhausted ? (
          <p>已重試 {MAX_RETRIES} 次仍無法恢復，請重新整頁載入。</p>
        ) : (
          <button
            type="button"
            className="pill-button"
            onClick={this.handleRetry}
          >
            重新嘗試（{this.state.retries + 1}/{MAX_RETRIES}）
          </button>
        )}
      </div>
    );
  }
}
