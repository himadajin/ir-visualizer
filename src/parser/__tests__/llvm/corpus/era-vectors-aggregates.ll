; Vector arithmetic, an aggregate return type, and insertvalue/extractvalue.
define { i32, i64 } @pack(i32 %a, i64 %b) {
entry:
  %r0 = insertvalue { i32, i64 } undef, i32 %a, 0
  %r1 = insertvalue { i32, i64 } %r0, i64 %b, 1
  ret { i32, i64 } %r1
}

define i64 @second({ i32, i64 } %p) {
entry:
  %v = extractvalue { i32, i64 } %p, 1
  ret i64 %v
}

define i64 @sumlanes(<2 x i64> %x, <2 x i64> %y) {
entry:
  %s = add <2 x i64> %x, %y
  %lo = extractelement <2 x i64> %s, i32 0
  %hi = extractelement <2 x i64> %s, i32 1
  %t = add i64 %lo, %hi
  ret i64 %t
}
