import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 數字欄位的輸入過濾：桌機鍵盤打得出字母，貼上也可能帶雜字
export const onlyDigits = (s: string) => s.replace(/\D/g, '')
export const onlyDecimal = (s: string) => {
  const [int, ...rest] = s.replace(/[^\d.]/g, '').split('.')
  return rest.length ? `${int}.${rest.join('')}` : int // 只留第一個小數點
}
