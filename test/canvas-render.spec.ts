import type { Pin } from '~/types/pinatlas'
import { describe, expect, it } from 'vitest'
import { drawPackage, hitTestSlots, neighborSlot } from '~/utils/canvas-render'
import { bodyRect, layoutPackage } from '~/utils/package-layout'

/** 记录式 ctx：断言绘制调用，不依赖真实 canvas */
function mockCtx() {
  const calls: { op: string, args: unknown[] }[] = []
  const record = (op: string) => (...args: unknown[]) => {
    calls.push({ op, args })
  }
  const ctx = {
    calls,
    setTransform: record('setTransform'),
    clearRect: record('clearRect'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arc: record('arc'),
    rect: record('rect'),
    roundRect: record('roundRect'),
    fill: record('fill'),
    stroke: record('stroke'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    fillText: record('fillText'),
    setLineDash: record('setLineDash'),
    save: record('save'),
    restore: record('restore'),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
  }
  return ctx
}

const palette = {
  io: '#111',
  power: '#222',
  ground: '#333',
  reset: '#444',
  boot: '#555',
  mono: '#666',
  nc: '#777',
  other: '#888',
  body: '#eee',
  border: '#ddd',
  foreground: '#000',
  mutedForeground: '#999',
  ring: '#aaa',
  fontFamily: 'sans-serif',
}

function linearPins(n: number): Pin[] {
  return Array.from({ length: n }, (_, i) => ({
    position: String(i + 1),
    pad: `P${i + 1}`,
    name: `P${i + 1}`,
    type: 'io' as const,
    functions: [],
  }))
}

function gridPins(rows: number, cols: number): Pin[] {
  const letters = 'ABCDEFGHJKLMNPRTUVWY'
  const out: Pin[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 1; c <= cols; c++) {
      out.push({ position: `${letters[r]}${c}`, pad: `${letters[r]}${c}`, name: `${letters[r]}${c}`, type: 'io', functions: [] })
    }
  }
  return out
}

function render(kind: 'quad' | 'grid' | 'dual', pins: Pin[], extra: { selected?: string | null, showPadLabels?: boolean, activeType?: string | null } = {}) {
  const ctx = mockCtx()
  const layout = layoutPackage({ kind, pins })
  const info = new Map(pins.map(p => [p.position, { type: p.type, pad: p.pad }]))
  drawPackage(ctx, {
    slots: layout.slots,
    pinInfo: info,
    palette,
    view: 1000,
    cssWidth: 720,
    cssHeight: 720,
    dpr: 2,
    selected: extra.selected ?? null,
    hovered: null,
    activeType: extra.activeType ?? null,
    showPadLabels: extra.showPadLabels ?? true,
    body: bodyRect,
  })
  return { ctx, layout }
}

describe('canvas 渲染：quad', () => {
  it('48 脚四边封装画出 48 个引脚块 + 48 组标签', () => {
    const { ctx } = render('quad', linearPins(48))
    const rects = ctx.calls.filter(c => c.op === 'rect' && (c.args[2] as number) < 100 && (c.args[3] as number) < 100)
    expect(rects).toHaveLength(48)
    // 每个引脚 2 段文字（引脚号 + pad 名）
    expect(ctx.calls.filter(c => c.op === 'fillText')).toHaveLength(96)
    // 先复位变换、按 dpr 清屏，再按 dpr 缩放绘制
    expect(ctx.calls[0]).toEqual({ op: 'setTransform', args: [1, 0, 0, 1, 0, 0] })
    expect(ctx.calls.find(c => c.op === 'clearRect')?.args).toEqual([0, 0, 1440, 1440])
    expect(ctx.calls.some(c => c.op === 'setTransform' && c.args[0] === 2 * (720 / 1000))).toBe(true)
  })

  it('引脚密时不画 pad 名（只留引脚号）', () => {
    const { ctx } = render('quad', linearPins(176), { showPadLabels: false })
    expect(ctx.calls.filter(c => c.op === 'fillText')).toHaveLength(176)
  })

  it('选中时多画一个选中环（strokeRect 走 rect + stroke）', () => {
    const without = render('quad', linearPins(48))
    const withSel = render('quad', linearPins(48), { selected: '9' })
    const rectCount = (r: ReturnType<typeof render>) => r.ctx.calls.filter(c => c.op === 'rect').length
    expect(rectCount(withSel)).toBe(rectCount(without) + 1)
  })

  it('本体是圆角矩形 + 一个 pin1 标记圆', () => {
    const { ctx } = render('quad', linearPins(48))
    expect(ctx.calls.some(c => c.op === 'roundRect')).toBe(true)
    const arcs = ctx.calls.filter(c => c.op === 'arc')
    expect(arcs).toHaveLength(1)
    expect(arcs[0].args.slice(0, 2)).toEqual([bodyRect.x + 34, bodyRect.y + 34])
  })
})

describe('canvas 渲染：grid', () => {
  it('64 球网格画 64 个圆 + pin1 标记', () => {
    const { ctx } = render('grid', gridPins(8, 8))
    expect(ctx.calls.filter(c => c.op === 'arc')).toHaveLength(65)
    expect(ctx.calls.filter(c => c.op === 'fillText')).toHaveLength(64)
  })

  it('nC 类型用虚线描边', () => {
    const pins: Pin[] = [{ position: 'A1', pad: 'A1', name: 'A1', type: 'nc', functions: [] }]
    const { ctx } = render('grid', pins)
    expect(ctx.calls.some(c => c.op === 'setLineDash' && (c.args[0] as number[]).length === 2)).toBe(true)
  })
})

describe('命中检测（canvas 没有 per-pin DOM，靠几何反查）', () => {
  const layout = layoutPackage({ kind: 'quad', pins: linearPins(48) })

  it('点在引脚矩形内命中，框外不命中', () => {
    const first = layout.slots[0]
    expect(hitTestSlots(layout.slots, first.cx, first.cy)?.position).toBe(first.position)
    expect(hitTestSlots(layout.slots, first.cx, first.cy - first.h - 10)).toBeNull()
  })

  it('球命中用半径', () => {
    const grid = layoutPackage({ kind: 'grid', pins: gridPins(8, 8) })
    const ball = grid.slots[3]
    expect(hitTestSlots(grid.slots, ball.cx + 1, ball.cy + 1)?.position).toBe(ball.position)
    expect(hitTestSlots(grid.slots, ball.cx + ball.w, ball.cy + ball.w)).toBeNull()
  })
})

describe('方向键导航（canvas 没有 per-pin DOM 焦点，只能自己算）', () => {
  const layout = layoutPackage({ kind: 'quad', pins: linearPins(48) })
  const slot = (position: string) => layout.slots.find(s => s.position === position)!

  it('同边顺序移动：1 号脚 ↓ 到 2 号脚，12 号脚再 ↓ 不越界', () => {
    expect(neighborSlot(layout.slots, slot('1'), 'ArrowDown')?.position).toBe('2')
    expect(neighborSlot(layout.slots, slot('1'), 'ArrowUp')).toBeNull()
  })

  it('垂直当前边：1 号脚 → 跳到右列同一行附近，而不是顶边', () => {
    const next = neighborSlot(layout.slots, slot('1'), 'ArrowRight')!
    expect(next.side).toBe('right')
    expect(Math.abs(next.cy - slot('1').cy)).toBeLessThan(20)
  })

  it('下边按 → 顺序前进，按 ↑ 跳到上边', () => {
    expect(neighborSlot(layout.slots, slot('13'), 'ArrowRight')?.position).toBe('14')
    expect(neighborSlot(layout.slots, slot('20'), 'ArrowUp')?.side).toBe('top')
  })

  it('网格封装用几何邻近', () => {
    const grid = layoutPackage({ kind: 'grid', pins: gridPins(8, 8) })
    const a1 = grid.slots.find(s => s.position === 'A1')!
    expect(neighborSlot(grid.slots, a1, 'ArrowRight')?.position).toBe('A2')
    expect(neighborSlot(grid.slots, a1, 'ArrowDown')?.position).toBe('B1')
  })
})
