Feature: Object steps

  Background:
    Given the stories of "src/Empty.stories.ts"
    And the "default" story

  Scenario: Set and verify an object
    Given object is:
      """
      {
        "name": "John",
        "age": 30
      }
      """
    Then object should contain:
      """
      {
        "name": "John"
      }
      """

  Scenario: Set and verify a nested object
    Given object is:
      """
      {
        "user": {
          "name": "Alice",
          "role": "admin"
        },
        "active": true
      }
      """
    Then object should contain:
      """
      {
        "user": {
          "role": "admin"
        }
      }
      """
