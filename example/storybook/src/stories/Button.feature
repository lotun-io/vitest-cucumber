Feature: Button
  Each row runs on a story of `Button.stories.ts`, its `story` column (`Given the "<story>" story`):
  the story there gives it its `args`, these steps check what they render. The first examples are tagged `@smoke`, a
  Storybook tag of their stories (`pnpm test:smoke` runs only those). The last scenario's story is
  unmounted (`Given the unmounted "Primary" story`): its steps mount it, with a label of their own.

  Background:
    Given the stories of "./Button.stories.ts"

  Scenario Outline: <story>
    Given the "<story>" story
    Then the button is <kind>
    And the button is <size>
    When I click the button
    Then its click handler was called

    @smoke
    Examples: Kinds
      | story     | kind      | size   |
      | Primary   | primary   | medium |
      | Secondary | secondary | medium |

    Examples: Sizes
      | story | kind      | size  |
      | Large | secondary | large |
      | Small | secondary | small |

  Scenario: A label of the scenario's
    Given the unmounted "Primary" story
    When I mount it with the label "Save"
    Then I see the "Save" button
