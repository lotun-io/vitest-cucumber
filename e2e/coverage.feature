Feature: Coverage
  Vitest's coverage of the user's code: the support code, and the modules it imports, through the
  feature files' modules (Vite's runner), each count at its own line, in node and browser mode.

  Background:
    Given a file named "src/calculator.ts" with:
      """
      // Its type: Node would strip it in place, Vite's transform removes it (other positions).
      export type Operator = "+" | "-" | "*";

      export function calculate(left: number, operator: Operator, right: number): number {
        switch (operator) {
          case "+":
            return left + right;
          case "-":
            return left - right;
          default:
            return left * right;
        }
      }

      export function neverCalled(value: number): string {
        return `never: ${value}`;
      }
      """
    And a file named "features/steps.ts" with:
      """
      import { Given, Then } from "@cucumber/cucumber";
      import { expect } from "vitest";
      import { calculate, type Operator } from "../src/calculator.ts";

      let result = 0;

      Given("I calculate {int} {word} {int}", (left: number, operator: string, right: number) => {
        result = calculate(left, operator as Operator, right);
      });

      Then("the result is {int}", (expected: number) => {
        expect(result).toBe(expected);
      });

      Then("an unused step", () => {
        throw new Error("never runs");
      });
      """
    And a file named "features/calculator.feature" with:
      """
      Feature: Calculator
        Scenario: adding
          Given I calculate 1 + 2
          Then the result is 3

        Scenario: multiplying
          Given I calculate 2 * 3
          Then the result is 6
      """

  Scenario Outline: The user's code is covered at its own lines (<mode>)
    When I run vitest in <mode> mode with options:
      """
      {
        "coverage": {
          "enabled": true,
          "provider": "v8",
          "include": ["src/**/*.ts", "features/**/*.ts"],
          "reporter": ["json"]
        }
      }
      """
    Then it passes
    And the coverage of "src/calculator.ts" is:
      | LINE | HITS |
      | 5    | 2    |
      | 7    | 1    |
      | 9    | 0    |
      | 11   | 1    |
      | 16   | 0    |
    And the coverage of "features/steps.ts" is:
      | LINE | HITS |
      | 5    | 1    |
      | 7    | 1    |
      | 8    | 2    |
      | 11   | 1    |
      | 12   | 2    |
      | 15   | 1    |
      | 16   | 0    |

    Examples:
      | mode      |
      | node      |
      | browser   |
      | storybook |
