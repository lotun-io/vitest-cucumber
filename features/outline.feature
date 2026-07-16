Feature: Scenario outline

  Scenario Outline: Doubling <input>
    Given a value of <input>
    When I double it
    Then the value should be <output>

    Examples:
      | input | output |
      | 3     | 6      |
      | 5     | 10     |
      | 7     | 14     |

  Scenario Outline: Adding <n> to <base>
    Given a value of <base>
    When I add <n>
    Then the value should be <result>

    Examples:
      | base | n | result |
      | 0    | 5 | 5      |
      | 10   | 4 | 14     |
