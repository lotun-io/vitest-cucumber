@login
Feature: Login
  Each scenario, and each Outline row, is a story on the meta of `Login.stories.ts` (no Storybook step):
  the story renders, its play runs the scenario.

  Background:
    Given I see the "Log in" button

  Scenario: Log in
    When I click the "Log in" button
    Then I see the "Log out" button
    And I see the text "Jane Doe"

  Scenario Outline: Sign up then log out with <first>
    When I click the "<first>" button
    And I click the "Log out" button
    Then I see the "Log in" button

    Examples:
      | first   |
      | Log in  |
      | Sign up |
