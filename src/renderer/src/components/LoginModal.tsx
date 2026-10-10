// 登录弹窗：扫码（轮询）/ 短信（占位）/ Cookie 三种方式
import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { QRCodeSVG } from 'qrcode.react'
import { queryClient } from '@renderer/api/client'
import { Button, Modal, Spinner, toast } from './ui'

export const useLoginModal = create<{ visible: boolean; open: () => void; close: () => void }>((set) => ({
  visible: false,
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
}))

type Tab = 'qr' | 'sms' | 'cookie'

export function LoginModal() {
  const { visible, close } = useLoginModal()
  const [tab, setTab] = useState<Tab>('qr')

  return (
    <Modal open={visible} onClose={close} title="登录 B 站" width={440}>
      <div className="mb-4 flex gap-1 rounded-lg bg-black/5 p-1 dark:bg-white/5">
        {(['qr', 'sms', 'cookie'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md py-1.5 text-sm transition ${
              tab === t ? 'bg-[var(--color-surface)] font-medium shadow-sm' : 'text-[var(--color-text-secondary)]'
            }`}
          >
            {t === 'qr' ? '扫码登录' : t === 'sms' ? '短信登录' : 'Cookie 登录'}
          </button>
        ))}
      </div>

      {tab === 'qr' && <QrTab onSuccess={close} />}
      {tab === 'sms' && <SmsTab />}
      {tab === 'cookie' && <CookieTab onSuccess={close} />}
    </Modal>
  )
}

function QrTab({ onSuccess }: { onSuccess: () => void }) {
  const [qrUrl, setQrUrl] = useState('')
  const [qrcodeKey, setQrcodeKey] = useState('')
  const [status, setStatus] = useState('生成中…')
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const r = await window.api.bili.qrGenerate()
      if (cancelled) return
      if (!r.ok) {
        setStatus(`二维码生成失败：${r.error.message}`)
        return
      }
      setQrUrl(r.data.url)
      setQrcodeKey(r.data.qrcodeKey)
      setStatus('请使用 Bilibili App 扫码')
    })()
    return () => {
      cancelled = true
      if (timerRef.current != null) window.clearInterval(timerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!qrcodeKey) return
    timerRef.current = window.setInterval(async () => {
      const r = await window.api.bili.qrPoll(qrcodeKey)
      if (!r.ok) {
        setStatus(r.error.message)
        return
      }
      setStatus(r.data.message)
      if (r.data.status === 'success') {
        if (timerRef.current != null) window.clearInterval(timerRef.current)
        await queryClient.invalidateQueries({ queryKey: ['auth'] })
        toast('登录成功', 'success')
        onSuccess()
      } else if (r.data.status === 'expired' || r.data.status === 'failed') {
        if (timerRef.current != null) window.clearInterval(timerRef.current)
      }
    }, 2000)
    return () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current)
    }
  }, [qrcodeKey, onSuccess])

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      {qrUrl ? (
        <div className="rounded-lg bg-white p-3">
          <QRCodeSVG value={qrUrl} size={200} />
        </div>
      ) : (
        <div className="flex h-[224px] items-center">
          <Spinner />
        </div>
      )}
      <p className="text-sm text-[var(--color-text-secondary)]">{status}</p>
    </div>
  )
}

function SmsTab() {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)

  const send = async (): Promise<void> => {
    if (!/^1\d{10}$/.test(phone)) {
      toast('请输入正确的手机号', 'error')
      return
    }
    setSending(true)
    const r = await window.api.bili.smsSend(phone)
    setSending(false)
    toast(r.ok ? r.data.message : r.error.message, r.ok ? 'info' : 'error')
  }

  const login = async (): Promise<void> => {
    if (!phone || !code) {
      toast('请输入手机号和验证码', 'error')
      return
    }
    const r = await window.api.bili.smsLogin(phone, code)
    if (r.ok) toast('登录成功', 'success')
    else toast(r.error.message, 'error')
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="手机号"
        className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] dark:border-white/15"
      />
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="验证码"
          className="min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] dark:border-white/15"
        />
        <Button variant="secondary" onClick={() => void send()} disabled={sending}>
          {sending ? '发送中' : '获取验证码'}
        </Button>
      </div>
      <Button onClick={() => void login()}>登录</Button>
      <p className="text-xs text-[var(--color-text-secondary)]">提示：短信登录需人机验证，MVP 暂不支持，请使用扫码或 Cookie 登录。</p>
    </div>
  )
}

function CookieTab({ onSuccess }: { onSuccess: () => void }) {
  const [cookie, setCookie] = useState('')
  const [loading, setLoading] = useState(false)

  const login = async (): Promise<void> => {
    if (!cookie.trim()) {
      toast('请粘贴 Cookie', 'error')
      return
    }
    setLoading(true)
    const r = await window.api.bili.cookieLogin(cookie.trim())
    setLoading(false)
    if (r.ok) {
      await queryClient.invalidateQueries({ queryKey: ['auth'] })
      toast('登录成功', 'success')
      onSuccess()
    } else {
      toast(r.error.message, 'error')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={cookie}
        onChange={(e) => setCookie(e.target.value)}
        placeholder="粘贴完整 Cookie（需包含 SESSDATA）"
        className="h-32 w-full rounded-lg border border-black/10 bg-transparent p-3 text-sm outline-none focus:border-[var(--color-accent)] dark:border-white/15"
      />
      <Button onClick={() => void login()} disabled={loading}>
        {loading ? '校验中…' : '登录'}
      </Button>
      <p className="text-xs text-[var(--color-text-secondary)]">
        Cookie 将经系统安全存储加密后保存在本机，不会上传到任何服务器。
      </p>
    </div>
  )
}
