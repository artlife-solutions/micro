import { assert, expect } from 'chai';
import 'mocha';
import { micro } from '../index';
import { main } from './test-microservice';

describe('micro', () => {

    it('should instatiate micro', ()  => {
        const service = micro();
        expect(service).to.not.be.undefined;
    });

});
