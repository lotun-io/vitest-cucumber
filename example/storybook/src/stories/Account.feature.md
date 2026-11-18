# Feature: Account

The same steps as `Login.feature`, written as Markdown (cucumber's `.feature.md`): each scenario is a
story on the meta of `Account.stories.ts`.

## Background:

* Given I see the "Log in" button

## Scenario: Sign up

* When I click the "Sign up" button
* Then I see the "Log out" button
* And I see the text "Jane Doe"

## Scenario Outline: Log out after <button>

* When I click the "<button>" button
* And I click the "Log out" button
* Then I see the "Log in" button

### Examples:

  | button  |
  | ------- |
  | Log in  |
  | Sign up |

## Rule: A signed-up user can log out

### Background:

* When I click the "Sign up" button

### Scenario: Log out after signing up

* When I click the "Log out" button
* Then I see the "Log in" button
