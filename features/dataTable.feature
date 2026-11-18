Feature: Data tables

  Scenario: Data table argument
    Given the following values:
      | key   | value |
      | first | 7     |
    Then the world value should be 7

  Scenario: Every DataTable accessor
    Given a table with every accessor:
      | key | value |
      | a   | 1     |
      | b   | 2     |
