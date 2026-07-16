Feature: Hook errors

  @failBefore
  Scenario: Before hook fails
    Given a value of 1

  @failAfter
  Scenario: After hook fails
    Given a value of 1
