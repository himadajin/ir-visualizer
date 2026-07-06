define i32 @f(i1 %c) {
entry:
  br i1 %c, label %a, label %b
a:
  br label %m
b:
  br label %m
m:
  %x = phi i32 [ 0, %a ], [ 1, %b ]
  ret i32 %x
}
