Feature: Greeting
  A scenario and a Scenario Outline on the stories of `Greeting.stories.ts`: the story a step names
  (`Given the Ada story`) gives the scenario its `args`, an Outline's rows each name theirs with a
  column, and a scenario that names none runs on the meta (its `name` is "World").

  @smoke
  Scenario: Saying hello
    Given the Ada story
    When I click the "Say hello" button
    Then I see the text "Hello, Ada!"

  Scenario Outline: Greeting <name>
    Given the <name> story
    When I click the "Say hello" button
    Then I see the text "Hello, <name>!"

    Examples:
      | name  |
      | Ada   |
      | Grace |

  Scenario: Greeting the world
    When I click the "Say hello" button
    Then I see the text "Hello, World!"
    And its "onGreet" handler was called
