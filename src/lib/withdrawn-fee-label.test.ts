import {expect,it} from 'vitest'
import {withdrawnFeeLabel} from './withdrawn-fee-label'
it('labels only fully canceled main fees as canceled and preserves retained amounts',()=>{
 expect(withdrawnFeeLabel(100,[{category:'main',chargedCents:0,cancelledCents:100}])).toBe('$1.00 · canceled')
 expect(withdrawnFeeLabel(100,[{category:'main',chargedCents:50,cancelledCents:50}])).toBe('$1.00 · $0.50 retained after withdrawal')
 expect(withdrawnFeeLabel(100,[{category:'extra',chargedCents:0,cancelledCents:100}])).not.toContain('canceled')
 expect(withdrawnFeeLabel(100)).toContain('checking withdrawal')
})
