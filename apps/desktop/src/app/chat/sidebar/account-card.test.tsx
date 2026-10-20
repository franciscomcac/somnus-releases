import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const getSomnusAccount = vi.fn()

vi.mock('@/api/somnus', () => ({ getSomnusAccount: () => getSomnusAccount() }))

import { accountDisplayName, SidebarAccountCard } from './account-card'

describe('SidebarAccountCard', () => {
  afterEach(cleanup)

  it('shows who is signed in and their balance', async () => {
    getSomnusAccount.mockResolvedValue({ signed_in: true, email: 'jamie.m@example.com', balance_usd: 42.18 })
    render(<SidebarAccountCard />)
    expect(await screen.findByText('Jamie M')).toBeTruthy()
    expect(screen.getByText('$42.18 credit')).toBeTruthy()
  })

  it('renders nothing when nobody is signed in', async () => {
    getSomnusAccount.mockResolvedValue({ signed_in: false })
    const { container } = render(<SidebarAccountCard />)
    await Promise.resolve()
    expect(container.querySelector('[data-slot="somnus_account_card"]')).toBeNull()
  })

  it('derives a readable name from any email', () => {
    expect(accountDisplayName('ana_rita-silva@x.pt')).toBe('Ana Rita Silva')
    expect(accountDisplayName(undefined)).toBe('Somnus')
  })
})
