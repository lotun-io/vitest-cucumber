Feature: Session
  A feature file away from its stories file: no `Session.stories.ts` is next to it, so its stories
  file step names one, from the project's root (`Header.stories.ts`, which `Header.feature` uses too).
  Its scenarios are listed under that file's title, next to `Header.feature`'s: `Example/Header`,
  then `Feature: Session`.

  Background:
    Given the stories of src/stories/Header.stories.ts

  Scenario: Logging in
    Given the LoggedOut story
    When I click the "Log in" button
    Then its "onLogin" handler was called

  Scenario: The user's name
    Given the LoggedIn story
    Then I see the text "Jane Doe"
