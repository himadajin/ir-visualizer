; A switch with negative and large case values, plus nested unconditional
; branches funneling into a merge block.
define i32 @classify(i64 %v) {
entry:
  switch i64 %v, label %other [
    i64 -1, label %neg
    i64 0, label %zero
    i64 1, label %one
    i64 4294967296, label %big
  ]

neg:
  br label %merge

zero:
  br label %merge

one:
  br label %merge

big:
  br label %merge

other:
  br label %merge

merge:
  ret i32 0
}
