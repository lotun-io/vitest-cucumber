Feature: Header
  Each scenario runs on the story of `Header.stories.ts` its first step names (`LoggedIn`,
  `LoggedOut`): the story there gives it its `args` (a user, or none), the meta its spies (`fn()`),
  these steps check the header and what its buttons call.

  @smoke
  Scenario: Logged in
    Given the LoggedIn story
    Then I see the text "Jane Doe"
    When I click the "Log out" button
    Then its "onLogout" handler was called

  Scenario: Logged out
    Given the LoggedOut story
    Then I see the "Log in" button
    When I click the "Sign up" button
    Then its "onCreateAccount" handler was called
