Feature: Timeouts

  Scenario: wrapPromiseWithTimeout rejects
    Then a slow action times out

  @failMessage(timed_out)
  Scenario: A step that exceeds its timeout fails
    Then the step exceeds its timeout
