import { expect, it } from 'vitest'
import { onlyDecimal, onlyDigits } from './utils'

it('數字欄位只留數字（與一個小數點）', () => {
  expect(onlyDigits('1a2-3.4')).toBe('1234')
  expect(onlyDecimal('21.0975')).toBe('21.0975')
  expect(onlyDecimal('4x2.1.9e')).toBe('42.19')
  expect(onlyDecimal('.5')).toBe('.5')
})
