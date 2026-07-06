define void @f() {
entry:
  br label %loop
loop:
  br label %loop, !llvm.loop !1
}
!1 = !{!1}
