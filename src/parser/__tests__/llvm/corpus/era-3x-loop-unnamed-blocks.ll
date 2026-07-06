; LLVM 3.x-6.x flavor: unnamed blocks appear only as "; <label>:N" comments,
; old-style load/getelementptr without a separate pointee type, and a
; !llvm.loop suffix on a conditional br.
@counter = global i32 0

define i32 @loop(i32 %n) {
  br label %1

; <label>:1                                       ; preds = %1, %0
  %2 = phi i32 [ 0, %0 ], [ %3, %1 ]
  %3 = add i32 %2, 1
  %4 = load i32* @counter
  %5 = icmp slt i32 %3, %n
  br i1 %5, label %1, label %6, !llvm.loop !0

; <label>:6                                       ; preds = %1
  %7 = getelementptr i32* @counter, i32 0
  ret i32 %3
}

!0 = !{!0}
