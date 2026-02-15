import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getDailyTarget, getDayNumber, EQUATION_LENGTH, MAX_GUESSES, VALID_CHARS,
  validateGuess, getGuessResult,
  loadStats, saveStats, loadState, saveState, generateShareText,
} from './game'
import type { CellState, GameStats } from './game'

function App() {
  const target = getDailyTarget()
  const dayNumber = getDayNumber()

  const [guesses, setGuesses] = useState<string[]>([])
  const [currentGuess, setCurrentGuess] = useState('')
  const [finished, setFinished] = useState(false)
  const [won, setWon] = useState(false)
  const [toasts, setToasts] = useState<string[]>([])
  const [showHelp, setShowHelp] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [stats, setStats] = useState<GameStats>(loadStats())
  const [shakeRow, setShakeRow] = useState(false)
  const initialized = useRef(false)

  // Load saved state
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const saved = loadState()
    if (saved) {
      setGuesses(saved.guesses)
      setFinished(saved.finished)
      setWon(saved.won)
      if (saved.finished) {
        setTimeout(() => setShowStats(true), 500)
      }
    } else {
      // First time? Show help
      const hasPlayed = loadStats().played > 0
      if (!hasPlayed) setShowHelp(true)
    }
  }, [])

  const toast = useCallback((msg: string) => {
    setToasts(t => [...t, msg])
    setTimeout(() => setToasts(t => t.slice(1)), 2000)
  }, [])

  // Key states for keyboard coloring
  const keyStates = useCallback((): Record<string, CellState> => {
    const states: Record<string, CellState> = {}
    for (const guess of guesses) {
      const result = getGuessResult(guess, target)
      for (let i = 0; i < guess.length; i++) {
        const ch = guess[i]
        const s = result[i]
        if (s === 'correct') states[ch] = 'correct'
        else if (s === 'present' && states[ch] !== 'correct') states[ch] = 'present'
        else if (s === 'absent' && !states[ch]) states[ch] = 'absent'
      }
    }
    return states
  }, [guesses, target])

  const submitGuess = useCallback(() => {
    if (finished) return
    const validation = validateGuess(currentGuess, target)
    if (!validation.valid) {
      toast(validation.error!)
      setShakeRow(true)
      setTimeout(() => setShakeRow(false), 300)
      return
    }

    const newGuesses = [...guesses, currentGuess]
    const isCorrect = validateGuess(currentGuess, target).valid
    // Check if all cells are correct (the equation is valid, which means it's a win)
    const isWin = isCorrect
    const isLast = newGuesses.length >= MAX_GUESSES
    const done = isWin || isLast

    setGuesses(newGuesses)
    setCurrentGuess('')

    if (done) {
      setFinished(true)
      setWon(isWin)

      const newStats = { ...stats }
      newStats.played++
      if (isWin) {
        newStats.won++
        newStats.streak = (stats.lastDay === dayNumber - 1 || stats.lastDay === 0) ? stats.streak + 1 : 1
        newStats.maxStreak = Math.max(newStats.maxStreak, newStats.streak)
        newStats.guessDistribution[newGuesses.length - 1]++
      } else {
        newStats.streak = 0
      }
      newStats.lastDay = dayNumber
      saveStats(newStats)
      setStats(newStats)

      setTimeout(() => {
        if (isWin) toast('🎉 Brilliant!')
        else toast(`The answer was one possible equation`)
        setTimeout(() => setShowStats(true), 1500)
      }, 300)
    }

    saveState({ day: dayNumber, guesses: newGuesses, finished: done, won: isWin })
  }, [currentGuess, guesses, finished, target, dayNumber, stats, toast])

  const handleKey = useCallback((key: string) => {
    if (finished) return
    if (key === 'Enter') {
      submitGuess()
    } else if (key === 'Backspace') {
      setCurrentGuess(g => g.slice(0, -1))
    } else if (VALID_CHARS.includes(key) && currentGuess.length < EQUATION_LENGTH) {
      setCurrentGuess(g => g + key)
    }
  }, [finished, currentGuess, submitGuess])

  // Physical keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showHelp || showStats) return
      if (e.key === 'Enter') handleKey('Enter')
      else if (e.key === 'Backspace') handleKey('Backspace')
      else if (e.key === '*' || e.key === 'x') handleKey('×')
      else if (e.key === '/') handleKey('÷')
      else if (VALID_CHARS.includes(e.key)) handleKey(e.key)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleKey, showHelp, showStats])

  const share = () => {
    const text = generateShareText(guesses, target, dayNumber)
    navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard!'))
  }

  const kStates = keyStates()

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <div className="header-buttons">
          <button className="header-btn" onClick={() => setShowHelp(true)}>?</button>
        </div>
        <h1>Numbrle</h1>
        <div className="header-buttons">
          <button className="header-btn" onClick={() => setShowStats(true)}>📊</button>
        </div>
      </div>

      {/* Target */}
      <div className="target-display">
        <div className="target-label">Today's Target</div>
        <div className="target-number">{target}</div>
      </div>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map((t, i) => <div key={i} className="toast">{t}</div>)}
      </div>

      {/* Grid */}
      <div className="grid">
        {Array.from({ length: MAX_GUESSES }).map((_, rowIdx) => {
          const isCurrentRow = rowIdx === guesses.length && !finished
          const guess = guesses[rowIdx]
          const result = guess ? getGuessResult(guess, target) : null

          return (
            <div key={rowIdx} className="row" style={isCurrentRow && shakeRow ? { animation: 'shake 0.3s' } : undefined}>
              {Array.from({ length: EQUATION_LENGTH }).map((_, colIdx) => {
                let char = ''
                let className = 'cell'

                if (guess) {
                  char = guess[colIdx]
                  className += ` ${result![colIdx]} reveal`
                  // Stagger animation
                } else if (isCurrentRow) {
                  char = currentGuess[colIdx] || ''
                  if (colIdx === currentGuess.length) className += ' active'
                  if (char) className += ' filled pop'
                }

                return (
                  <div
                    key={colIdx}
                    className={className}
                    style={guess ? { animationDelay: `${colIdx * 0.1}s` } : undefined}
                  >
                    {char}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Keyboard */}
      <div className="keyboard">
        <div className="kb-row">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(k => (
            <button key={k} className={`key ${kStates[k] || ''}`} onClick={() => handleKey(k)}>{k}</button>
          ))}
        </div>
        <div className="kb-row">
          <button className="key enter" onClick={() => handleKey('Enter')}>ENTER</button>
          {['+', '-', '×', '÷', '='].map(k => (
            <button key={k} className={`key op ${kStates[k] || ''}`} onClick={() => handleKey(k)}>{k}</button>
          ))}
          <button className="key backspace" onClick={() => handleKey('Backspace')}>⌫</button>
        </div>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowHelp(false)}>×</button>
            <h2>How to Play</h2>
            <p>Build a valid math equation that equals today's target number in 6 guesses.</p>
            <p>Each equation must be exactly 6 characters and include an = sign.</p>
            <p>Example: if the target is <strong style={{ color: 'var(--green)' }}>42</strong>, a valid guess would be <strong style={{ color: 'var(--green)' }}>6×7=42</strong></p>
            <ul>
              <li>Use digits 0-9 and operators + - × ÷ =</li>
              <li>The right side of = must be the target number</li>
              <li>The left side must evaluate to the target</li>
              <li>Multiple valid solutions exist — any correct one wins!</li>
              <li>Standard math precedence applies (× ÷ before + -)</li>
            </ul>
            <h2 style={{ marginTop: 16 }}>Feedback</h2>
            <div className="example-cells">
              <div className="example-cell" style={{ background: 'var(--correct)', color: '#000' }}>6</div>
              <div className="example-cell" style={{ background: 'var(--bg-secondary)', border: '2px solid var(--cell-border)', color: 'var(--text)' }}>×</div>
              <div className="example-cell" style={{ background: 'var(--bg-secondary)', border: '2px solid var(--cell-border)', color: 'var(--text)' }}>7</div>
              <div className="example-cell" style={{ background: 'var(--bg-secondary)', border: '2px solid var(--cell-border)', color: 'var(--text)' }}>=</div>
              <div className="example-cell" style={{ background: 'var(--present)', color: '#000' }}>4</div>
              <div className="example-cell" style={{ background: 'var(--bg-secondary)', border: '2px solid var(--cell-border)', color: 'var(--text)' }}>2</div>
            </div>
            <ul>
              <li><strong style={{ color: 'var(--correct)' }}>Green</strong> — correct character, correct position</li>
              <li><strong style={{ color: 'var(--present)' }}>Yellow</strong> — correct character, wrong position</li>
              <li><strong style={{ color: 'var(--gray-light)' }}>Gray</strong> — character not in the solution</li>
            </ul>
            <p style={{ marginTop: 12, fontSize: '0.75rem' }}>A new puzzle appears every day at midnight.</p>
          </div>
        </div>
      )}

      {/* Stats Modal */}
      {showStats && (
        <div className="modal-overlay" onClick={() => setShowStats(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowStats(false)}>×</button>
            <h2>Statistics</h2>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{stats.played}</div>
                <div className="stat-label">Played</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{stats.played ? Math.round(stats.won / stats.played * 100) : 0}</div>
                <div className="stat-label">Win %</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{stats.streak}</div>
                <div className="stat-label">Streak</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{stats.maxStreak}</div>
                <div className="stat-label">Max Streak</div>
              </div>
            </div>
            <h2>Guess Distribution</h2>
            <div className="distribution">
              {stats.guessDistribution.map((count, i) => {
                const max = Math.max(...stats.guessDistribution, 1)
                return (
                  <div key={i} className="dist-row">
                    <span className="dist-label">{i + 1}</span>
                    <div
                      className={`dist-bar ${finished && won && guesses.length === i + 1 ? 'highlight' : ''}`}
                      style={{ width: `${Math.max(count / max * 100, 8)}%` }}
                    >
                      {count}
                    </div>
                  </div>
                )
              })}
            </div>
            {finished && won && (
              <button className="share-btn" onClick={share}>Share Results</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
