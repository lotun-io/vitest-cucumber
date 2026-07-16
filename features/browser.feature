@notNode
Feature: Browser UI interactions

  Scenario: Clicking a button updates the counter
    Given a counter widget is rendered
    When I click the "Increment" button
    And I click the "Increment" button
    Then the count should be 2
