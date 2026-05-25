import { setWorldConstructor } from '@cucumber/cucumber';

export class ArithmeticWorld {
  value = 0;
}

setWorldConstructor(ArithmeticWorld);
