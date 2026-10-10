// 渲染进程错误边界：捕获渲染异常，显示友好降级 UI 并结构化落盘
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? '未知错误' }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const traceId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      void window.api.log({
        level: 'error',
        scope: 'renderer',
        message: error?.message ?? '渲染异常',
        extra: { stack: error?.stack, componentStack: info.componentStack, traceId },
      })
    } catch {
      // 日志通道异常时静默，避免二次崩溃
    }
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    return (
      <div
        style={{
          display: 'flex',
          height: '100vh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          color: '#e5e5ea',
          background: '#0f0f13',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>页面出错了</h1>
        <p style={{ maxWidth: '70vw', fontSize: 14, opacity: 0.7, textAlign: 'center', margin: 0 }}>
          {this.state.message}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '8px 20px',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            color: '#fff',
            background: '#fb7299',
          }}
        >
          重载
        </button>
      </div>
    )
  }
}
