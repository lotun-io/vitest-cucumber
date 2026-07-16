Feature: World

  Scenario: Each scenario gets a fresh World
    Then the hook count should be 1
    And the world value should be 0

  Scenario: Arrow function uses world
    Given an arrow value of 5
    Then the world value should be 5

  Scenario: World receives parameters
    Then the world parameter greeting should be "hello"

  Scenario: world proxy reflects the real World
    Given an arrow value of 5
    And the world should reflect like a real World
