Feature: User card
  Cucumber's hooks around a story's scenario (`features/support/hooks.ts`): a `Before` hook tagged `@api`
  answers `fetch` with a user of its own, its `After` hook puts `fetch` back and attaches the user it
  gave. The steps log what they do: each test's annotations in Vitest (its attachments' data with
  `api.allowWrite`, `vite.config.ts`), notes after a failed story's steps in Storybook.

  Background:
    Given the stories of "./UserCard.stories.ts"
    And the "default" story

  @api
  Scenario: Loading the user
    When I click the "Load user" button
    Then I see the text "Ada Lovelace (ada@example.com)"
