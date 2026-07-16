Feature: Hook failures

  @failBefore
  @failMessage(Before_failed_intentionally)
  Scenario: A failing Before hook is reported
    Given a value of 1

  @failAfter
  @failMessage(After_failed_intentionally)
  Scenario: A failing After hook is reported
    Given a value of 1

  @afterRewrites
  Scenario: A scenario-level After rewrites a failed result to passed
    Given a failing step
