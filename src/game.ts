// Deterministic daily target number from date seed
export function getDailyTarget(date: Date = new Date()): number {
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  let hash = 0
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash + dateStr.charCodeAt(i)) | 0
  }
  // Range: 1-99 so equations fit in 6 chars (e.g., "6×7=42")
  return (((hash & 0x7fffffff) % 99) + 1)
}

export function getDayNumber(): number {
  const epoch = new Date('2026-02-15')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  epoch.setHours(0, 0, 0, 0)
  return Math.floor((now.getTime() - epoch.getTime()) / 86400000) + 1
}

export const EQUATION_LENGTH = 6
export const MAX_GUESSES = 6
export const VALID_CHARS = '0123456789+-×÷='

// Parse and evaluate a math expression (left side of =)
function evaluate(expr: string): number | null {
  // Replace display chars with JS-friendly ones for parsing
  // We'll parse manually to respect left-to-right with proper precedence
  const tokens: { type: 'num' | 'op'; value: string }[] = []
  let numBuf = ''

  for (const ch of expr) {
    if (ch >= '0' && ch <= '9') {
      numBuf += ch
    } else if ('+-×÷'.includes(ch)) {
      if (numBuf === '') return null // operator without number (except leading minus handled below)
      tokens.push({ type: 'num', value: numBuf })
      numBuf = ''
      tokens.push({ type: 'op', value: ch })
    } else {
      return null
    }
  }
  if (numBuf === '') return null
  tokens.push({ type: 'num', value: numBuf })

  if (tokens.length === 0) return null
  if (tokens[0].type !== 'num') return null

  // Standard math precedence: × ÷ first, then + -
  const nums: number[] = []
  const ops: string[] = []

  nums.push(Number(tokens[0].value))

  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i].value
    const num = Number(tokens[i + 1].value)

    if (op === '×' || op === '÷') {
      const prev = nums.pop()!
      if (op === '×') nums.push(prev * num)
      else {
        if (num === 0) return null
        const result = prev / num
        if (!Number.isInteger(result)) return null
        nums.push(result)
      }
    } else {
      nums.push(num)
      ops.push(op)
    }
  }

  let result = nums[0]
  for (let i = 0; i < ops.length; i++) {
    if (ops[i] === '+') result += nums[i + 1]
    else result -= nums[i + 1]
  }

  return result
}

export function validateGuess(guess: string, target: number): { valid: boolean; error?: string } {
  if (guess.length !== EQUATION_LENGTH) {
    return { valid: false, error: `Equation must be ${EQUATION_LENGTH} characters` }
  }

  // Must contain exactly one =
  const eqParts = guess.split('=')
  if (eqParts.length !== 2) {
    return { valid: false, error: 'Equation must contain exactly one =' }
  }

  const [left, right] = eqParts
  if (left.length === 0 || right.length === 0) {
    return { valid: false, error: 'Both sides of = must have values' }
  }

  // Right side must be the target number
  const rightVal = Number(right)
  if (isNaN(rightVal) || rightVal !== target || right !== String(target)) {
    return { valid: false, error: `Right side must equal ${target}` }
  }

  // Left side must evaluate to target
  const leftVal = evaluate(left)
  if (leftVal === null) {
    return { valid: false, error: 'Invalid expression' }
  }
  if (leftVal !== target) {
    return { valid: false, error: `Expression equals ${leftVal}, not ${target}` }
  }

  return { valid: true }
}

export type CellState = 'correct' | 'present' | 'absent' | 'empty'

export function getGuessResult(guess: string, target: number): CellState[] {
  // We compare against ALL valid solutions? No — we compare character positions.
  // Since multiple solutions exist, we just give feedback on character positions
  // relative to the guess itself (any valid equation of that length equaling target).
  // Actually, Wordle-style: we need a specific answer to compare against.
  // But we accept multiple solutions. So feedback is: green if that char is correct
  // in ANY valid solution? No, that's too complex.
  //
  // Simplest approach: generate a "canonical" solution for the day, compare against that.
  // But the spec says "multiple valid solutions accepted" — meaning any correct equation wins.
  // So if the guess IS valid and equals target, it's all green (win).
  // If not valid, we compare against the canonical solution for positional feedback.

  const canonical = getCanonicalSolution(target)
  const result: CellState[] = Array(EQUATION_LENGTH).fill('absent')
  const solutionChars = canonical.split('')
  const guessChars = guess.split('')
  const used = Array(EQUATION_LENGTH).fill(false)

  // First pass: greens
  for (let i = 0; i < EQUATION_LENGTH; i++) {
    if (guessChars[i] === solutionChars[i]) {
      result[i] = 'correct'
      used[i] = true
    }
  }

  // Second pass: yellows
  for (let i = 0; i < EQUATION_LENGTH; i++) {
    if (result[i] === 'correct') continue
    for (let j = 0; j < EQUATION_LENGTH; j++) {
      if (!used[j] && guessChars[i] === solutionChars[j]) {
        result[i] = 'present'
        used[j] = true
        break
      }
    }
  }

  return result
}

// Generate a canonical solution for a given target
// Format: equation must be exactly 6 chars total including "=TARGET"
function getCanonicalSolution(target: number): string {
  const targetStr = String(target)
  const rightSide = '=' + targetStr
  const leftLen = EQUATION_LENGTH - rightSide.length

  // Try to find a simple equation
  // For 1-digit targets (e.g., 5): leftLen = 4, e.g., "02+03=5" won't work... "10-5=5" doesn't fit
  // Wait: 6 chars total. "=5" is 2 chars, left side is 4 chars.
  // "10÷2=5" = 6 chars ✓
  // For 2-digit targets (e.g., 42): "=42" is 3 chars, left is 3 chars: "42" doesn't work alone (need operator)
  // Actually "042=42" has no operator... we need a valid equation.
  // Hmm, does "42=42" count? That's only 4 chars. Need 6.
  // For 2 digits: left side is 3 chars. Options: "a+b" where a+b=42, like "9+33" (4 chars, too long)
  // 3 chars: single digit + op + single digit: "6×7=42" = 6 chars ✓

  // Brute force: try all possible left sides of length leftLen
  const solution = findSolution(target, leftLen)
  return solution + rightSide
}

function findSolution(target: number, length: number): string {
  // Generate all possible expressions of given length and find one that equals target
  const ops = ['+', '-', '×', '÷']

  // For efficiency, try structured patterns
  if (length === 4) {
    // Pattern: NN+N, NN-N, N×NN, etc.
    // Try: AB+C, AB-C, A×BC, etc.
    for (const op of ops) {
      // two digits, op, one digit: e.g. "12+3"
      for (let a = 0; a <= 99; a++) {
        for (let b = 0; b <= 9; b++) {
          const aStr = String(a).padStart(2, '0')
          const expr = aStr + op + String(b)
          if (expr.length === length && evaluate(expr) === target) return expr

          // one digit, op, two digits: e.g. "3+12"
          const bStr = String(b)
          const aStr2 = String(a).padStart(2, '0')
          const expr2 = bStr + op + aStr2
          if (expr2.length === length && evaluate(expr2) === target) return expr2
        }
      }
    }
    // three digits op one digit or vice versa
    for (const op of ops) {
      for (let a = 100; a <= 999; a++) {
        for (let b = 0; b <= 9; b++) {
          const expr = String(a) + op + String(b)
          if (expr.length === length && evaluate(expr) === target) return expr
        }
      }
    }
  }

  if (length === 3) {
    // A+B, A-B, A×B, A÷B
    for (const op of ops) {
      for (let a = 0; a <= 9; a++) {
        for (let b = 0; b <= 9; b++) {
          const expr = String(a) + op + String(b)
          if (expr.length === length && evaluate(expr) === target) return expr
        }
      }
    }
  }

  if (length === 2) {
    // Just two-digit number? But that's not an equation with an operator...
    // This would be for targets like 42 where right side is "=42" (3) + left is 3
    // Actually length 2 means target is 3+ digits. Let's just try NN
    for (let a = 10; a <= 99; a++) {
      // No operator, just number — but is that "valid"?
      // Actually for very large targets, the left side IS just the number itself
      // But we still need it to be a valid expression
    }
  }

  if (length === 5) {
    // For single-digit targets: e.g., =5 → left is 5 chars
    // Patterns: NN+NN, NNN+N, etc.
    for (const op of ops) {
      for (let a = 10; a <= 99; a++) {
        for (let b = 10; b <= 99; b++) {
          const expr = String(a) + op + String(b)
          if (expr.length === length && evaluate(expr) === target) return expr
        }
      }
      for (let a = 100; a <= 999; a++) {
        for (let b = 0; b <= 9; b++) {
          const expr = String(a) + op + String(b)
          if (expr.length === length && evaluate(expr) === target) return expr
          const expr2 = String(b) + op + String(a)
          if (expr2.length === length && evaluate(expr2) === target) return expr2
        }
      }
    }
    // Two operators: A+B+C type (length 5: d op d op d)
    for (const op1 of ops) {
      for (const op2 of ops) {
        for (let a = 0; a <= 9; a++) {
          for (let b = 0; b <= 9; b++) {
            for (let c = 0; c <= 9; c++) {
              const expr = String(a) + op1 + String(b) + op2 + String(c)
              if (expr.length === length && evaluate(expr) === target) return expr
            }
          }
        }
      }
    }
  }

  // Fallback: just use the target number itself padded (shouldn't happen with good ranges)
  return String(target).padStart(length, '0')
}

export { getCanonicalSolution as _getCanonical }

// Stats
export interface GameStats {
  played: number
  won: number
  streak: number
  maxStreak: number
  guessDistribution: number[]
  lastDay: number
}

const STATS_KEY = 'numbrle-stats'
const STATE_KEY = 'numbrle-state'

export function loadStats(): GameStats {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { played: 0, won: 0, streak: 0, maxStreak: 0, guessDistribution: [0, 0, 0, 0, 0, 0], lastDay: 0 }
}

export function saveStats(stats: GameStats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats))
}

export interface GameState {
  day: number
  guesses: string[]
  finished: boolean
  won: boolean
}

export function loadState(): GameState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (raw) {
      const state = JSON.parse(raw)
      if (state.day === getDayNumber()) return state
    }
  } catch {}
  return null
}

export function saveState(state: GameState) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state))
}

export function generateShareText(guesses: string[], target: number, dayNumber: number): string {
  const emojiMap: Record<CellState, string> = {
    correct: '🟩',
    present: '🟨',
    absent: '⬛',
    empty: '⬜',
  }
  const lines = guesses.map(g => {
    const result = getGuessResult(g, target)
    return result.map(r => emojiMap[r]).join('')
  })
  return `Numbrle #${dayNumber} ${guesses.length}/6\n\n${lines.join('\n')}\n\nnumbrle.vercel.app`
}
